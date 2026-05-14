// Content script injected into known ad-link / shortener landing pages.
//
// Three jobs, in order of preference:
//
//   1) Find the destination URL on the page (in <a href>, hidden inputs,
//      data-url attributes, textareas, or as plain text in the DOM) and
//      report it to the background service worker. This is the fastest
//      path: when the page already contains the destination, we don't
//      need to click anything — the background can short-circuit and
//      contribute it to Crowd-Bypass.
//
//   2) When the destination isn't there yet, auto-click well-known
//      "Get Link / Continue / Skip / Lấy link / Tiếp tục / Bỏ qua /
//      Vào link" buttons. Many VN sites (link4m, link1s, yeumoney…) gate
//      the destination behind a server-side countdown form; clicking
//      those buttons advances the flow until the page navigates to the
//      real URL (which the background script then captures via
//      webNavigation.onCommitted).
//
//   3) Auto-submit forms whose visible button matches the click texts.
//      That covers POST-based reveal flows like link4m's `<form>` step.
//
// Aggressive on confirmed shortener hosts (allowlist in manifest), polite
// elsewhere. Skip auto-click on captcha-gated sites (Linkvertise/Work.ink).

(() => {
  // ---- Selectors that frequently hold the destination URL --------------

  const DEST_SELECTORS = [
    "#go-link a[href^='http']",
    "a#go-link[href^='http']",
    "#showlink a[href^='http']",
    "#getlink[href^='http']",
    "a#getlink",
    "a.get-link[href^='http']",
    "a[id*='getlink'][href^='http']",
    "a[id*='showlink'][href^='http']",
    "a[class*='get-link'][href^='http']",
    "a[id='download'][href^='http']",
    "a.download[href^='http']",
    "a#download[href^='http']",
    "a[rel='nofollow'][target='_blank'][href^='http']",
  ];

  // ---- Click texts ----------------------------------------------------

  const CLICK_TEXTS = [
    "get link",
    "continue",
    "skip",
    "skip ad",
    "skip ads",
    "skip this",
    "click here to continue",
    "go to link",
    "open link",
    "free access",
    "i'm a human",
    "i am human",
    // Vietnamese
    "lấy link",
    "lay link",
    "vào link",
    "vao link",
    "tiếp tục",
    "tiep tuc",
    "bỏ qua",
    "bo qua",
    "bỏ qua quảng cáo",
    "xác nhận",
    "xac nhan",
    "nhận link",
    "nhan link",
  ];

  // ---- Hosts to avoid auto-clicking on (captcha / hCaptcha gated) ----

  const NO_AUTO_CLICK_HOSTS = [
    "linkvertise.com",
    "link-to.net",
    "linkvertise.net",
    "work.ink",
  ];

  const host = location.hostname;
  const autoClickAllowed = !NO_AUTO_CLICK_HOSTS.some(
    (h) => host === h || host.endsWith("." + h)
  );

  // ---- State ---------------------------------------------------------

  let reported = false;
  const clicked = new WeakSet();

  // ---- Helpers -------------------------------------------------------

  function reportDestination(url) {
    if (reported) return;
    if (!url || typeof url !== "string") return;
    if (!/^https?:\/\//i.test(url)) return;
    let abs;
    try {
      abs = new URL(url, location.href);
    } catch {
      return;
    }
    if (abs.hostname === location.hostname) return; // same site, not a destination
    if (
      /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google\.|facebook\.com\/tr|google-analytics\.com)$/i.test(
        abs.hostname
      )
    ) {
      return; // skip ad / tracker
    }
    reported = true;
    chrome.runtime.sendMessage(
      { type: "content-found-destination", url: abs.href },
      () => void chrome.runtime.lastError
    );
  }

  function elementText(el) {
    if (!el) return "";
    const direct = (el.innerText || el.textContent || "").trim();
    const aria = (el.getAttribute && el.getAttribute("aria-label")) || "";
    const value = (el.value || "").toString();
    return (direct + " " + aria + " " + value).toLowerCase();
  }

  function matchesClickText(el) {
    const t = elementText(el);
    if (!t || t.length > 80) return false;
    return CLICK_TEXTS.some((needle) => t.includes(needle));
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.hidden) return false;
    const rect = el.getBoundingClientRect && el.getBoundingClientRect();
    if (rect && (rect.width === 0 || rect.height === 0)) return false;
    const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (cs && (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0")) {
      return false;
    }
    return true;
  }

  function isDisabled(el) {
    if (!el) return true;
    if (el.disabled === true) return true;
    if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return true;
    if (el.hasAttribute && el.hasAttribute("disabled")) return true;
    const cls = (el.className || "").toString().toLowerCase();
    if (cls.includes("disabled")) return true;
    return false;
  }

  function safeClick(el) {
    if (!el || clicked.has(el)) return false;
    if (!isVisible(el)) return false;
    if (isDisabled(el)) return false;
    clicked.add(el);
    try {
      el.click();
      return true;
    } catch {
      return false;
    }
  }

  function urlInText(text) {
    if (!text || typeof text !== "string") return null;
    const m = text.match(/https?:\/\/[^\s"'<>]+/i);
    if (!m) return null;
    let candidate = m[0];
    // Strip trailing punctuation that often gets glued onto URLs in plain text.
    candidate = candidate.replace(/[)\].,;:!?]+$/, "");
    return candidate;
  }

  // ---- Scan: find destination URL on the page ------------------------

  function scan() {
    if (reported) return;

    // 1) Explicit destination anchors.
    for (const sel of DEST_SELECTORS) {
      const a = document.querySelector(sel);
      if (a && a.href) {
        reportDestination(a.href);
        if (reported) return;
      }
    }

    // 2) Anchors whose text matches an "open link" phrase.
    const anchors = document.querySelectorAll("a[href^='http']");
    for (const a of anchors) {
      if (matchesClickText(a)) {
        reportDestination(a.href);
        if (reported) return;
      }
    }

    // 3) Hidden inputs / data-url / textareas containing a URL.
    const inputs = document.querySelectorAll(
      "input[type='hidden'][value^='http'], input[readonly][value^='http'], textarea, [data-url^='http'], [data-link^='http'], [data-href^='http']"
    );
    for (const el of inputs) {
      const val =
        el.value ||
        el.getAttribute("data-url") ||
        el.getAttribute("data-link") ||
        el.getAttribute("data-href") ||
        el.textContent;
      const found = urlInText(val);
      if (found) {
        reportDestination(found);
        if (reported) return;
      }
    }

    // 4) Plain-text URL in code/pre blocks.
    const blocks = document.querySelectorAll("code, pre, .url, .download-link");
    for (const el of blocks) {
      const found = urlInText(el.textContent || "");
      if (found) {
        reportDestination(found);
        if (reported) return;
      }
    }
  }

  // ---- Auto-click Get Link / Continue / Submit form -----------------

  function tryAutoClick() {
    if (!autoClickAllowed || reported) return;

    // A) Buttons + button-like anchors that match the click-text list.
    const candidates = document.querySelectorAll(
      "button, a[href='#'], a[href=''], a[href^='javascript:'], a[role='button'], input[type='button'], input[type='submit']"
    );
    let clickedCount = 0;
    for (const el of candidates) {
      if (matchesClickText(el)) {
        if (safeClick(el)) clickedCount++;
      }
    }

    // B) Forms whose submit button looks like "Get Link". Many VN ad-link
    //    sites (link4m, link1s) post a form to /go/<id> or /links/go.
    if (clickedCount === 0) {
      const forms = document.querySelectorAll("form");
      for (const form of forms) {
        if (clicked.has(form)) continue;
        const sub = form.querySelector(
          "button[type='submit'], input[type='submit'], button:not([type='button']):not([type='reset'])"
        );
        if (sub && matchesClickText(sub) && !isDisabled(sub) && isVisible(sub)) {
          clicked.add(form);
          try {
            // Prefer clicking the actual submit element so any onclick handlers fire.
            if (!safeClick(sub)) form.submit();
          } catch {
            try { form.submit(); } catch {}
          }
        }
      }
    }
  }

  // ---- Lifecycle ---------------------------------------------------

  let stopped = false;

  function tick() {
    if (stopped) return;
    scan();
    tryAutoClick();
  }

  function start() {
    // Initial pass.
    tick();

    // Repeated polling while the page is alive — many ad-link sites
    // unlock buttons after countdowns of 5–15s.
    const interval = setInterval(tick, 1500);

    // DOM mutations also trigger rescans for fast-rendered destinations.
    const obs = new MutationObserver(() => {
      if (reported && stopped) return;
      tick();
    });
    obs.observe(document.documentElement, { subtree: true, childList: true });

    // Hard stop after 60s so we don't keep spinning forever.
    setTimeout(() => {
      stopped = true;
      clearInterval(interval);
      obs.disconnect();
    }, 60_000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
