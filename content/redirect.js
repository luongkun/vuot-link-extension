// Content script injected into known ad-link / shortener landing pages.
// Three jobs:
//   1) When the page renders the final destination link (e.g. a "Get Link" /
//      "Continue" button with an href), capture it and tell the background
//      service worker. The background script caches it and contributes back
//      to Crowd-Bypass.
//   2) Auto-click obvious "skip / continue / get link / lấy link / vào link"
//      buttons after a short delay so the user doesn't have to.
//   3) If the destination shows up as plain text (some sites print the URL
//      in a div / textarea after a countdown), capture that too.
//
// The script is intentionally conservative — only acts on the curated host
// allowlist in manifest.json and on well-known selectors / button texts.

(() => {
  const SAFE_LINK_SELECTORS = [
    "#go-link a[href]",
    "#go-link",
    "#showlink a[href]",
    "#getlink a[href]",
    "a#getlink",
    "a.get-link",
    "a.btn-captcha",
    "a[id*='getlink']",
    "a[id*='showlink']",
    "a[class*='get-link']",
    "a[id='download']",
    "a.download[href]",
    "a[rel='nofollow'][target='_blank'][href^='http']",
  ];

  const AUTO_CLICK_TEXTS = [
    "get link",
    "continue",
    "skip",
    "skip ad",
    "skip ads",
    "lấy link",
    "vào link",
    "tiếp tục",
    "bỏ qua",
    "bỏ qua quảng cáo",
    "i'm a human",
    "i am human",
    "click here to continue",
    "go to link",
  ];

  // Sites where auto-click is risky (Linkvertise / Work.ink show captchas) — we
  // still scan for the destination link but don't synthetically click anything.
  const NO_AUTO_CLICK_HOSTS = [
    "linkvertise.com",
    "link-to.net",
    "linkvertise.net",
    "work.ink",
  ];
  const autoClickAllowed = !NO_AUTO_CLICK_HOSTS.some((h) =>
    location.hostname === h || location.hostname.endsWith("." + h)
  );

  let reported = false;
  const clicked = new WeakSet();

  function reportDestination(url) {
    if (reported) return;
    if (!url || !/^https?:\/\//i.test(url)) return;
    try {
      const u = new URL(url, location.href);
      if (u.hostname === location.hostname) return; // same site, not a real destination
      // Skip obvious ad / tracker hosts.
      if (/doubleclick|googlesyndication|googleadservices/.test(u.hostname)) return;
      reported = true;
      chrome.runtime.sendMessage(
        { type: "content-found-destination", url: u.href },
        () => void chrome.runtime.lastError
      );
    } catch {
      // ignore
    }
  }

  function elementText(el) {
    return ((el && (el.innerText || el.textContent)) || "").trim().toLowerCase();
  }

  function matchesAutoClick(el) {
    const t = elementText(el);
    if (!t || t.length > 60) return false;
    return AUTO_CLICK_TEXTS.some((needle) => t.includes(needle));
  }

  function safeClick(el) {
    if (!el || clicked.has(el)) return;
    if (el.disabled) return;
    if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return;
    clicked.add(el);
    try {
      el.click();
    } catch {
      // ignore
    }
  }

  function tryAutoClick() {
    if (!autoClickAllowed || reported) return;
    // Buttons + anchors with relevant text. Anchors with hrefs are also
    // captured for reporting, but we only auto-click button-like elements
    // here so we don't inadvertently navigate to ads.
    const candidates = document.querySelectorAll(
      "button, a[href='#'], a[href='javascript:void(0)'], a[role='button'], input[type='button'], input[type='submit']"
    );
    for (const el of candidates) {
      if (matchesAutoClick(el)) safeClick(el);
    }
  }

  function urlInText(text) {
    if (!text || typeof text !== "string") return null;
    const m = text.match(/https?:\/\/[^\s"'<>]+/i);
    return m ? m[0] : null;
  }

  function scan() {
    // 1) Look for explicit destination anchors.
    for (const sel of SAFE_LINK_SELECTORS) {
      const a = document.querySelector(sel);
      if (a && a.href) {
        reportDestination(a.href);
        if (reported) return;
      }
    }

    // 2) Look at any anchor whose text matches an "open link" phrase.
    if (!reported) {
      const anchors = document.querySelectorAll("a[href^='http']");
      for (const a of anchors) {
        if (matchesAutoClick(a)) {
          reportDestination(a.href);
          if (reported) return;
        }
      }
    }

    // 3) Some sites embed the destination in a hidden input or data attribute.
    if (!reported) {
      const inputs = document.querySelectorAll(
        "input[type='hidden'][value^='http'], input[readonly][value^='http'], textarea, [data-url^='http'], [data-link^='http']"
      );
      for (const el of inputs) {
        const val =
          el.value ||
          el.getAttribute("data-url") ||
          el.getAttribute("data-link") ||
          el.textContent;
        const found = urlInText(val);
        if (found) {
          reportDestination(found);
          if (reported) return;
        }
      }
    }
  }

  function start() {
    scan();
    // Auto-click after a short delay so the page has time to render and
    // unlock its "wait N seconds" buttons.
    setTimeout(() => tryAutoClick(), 1500);
    setTimeout(() => tryAutoClick(), 4000);
    setTimeout(() => tryAutoClick(), 8000);

    const obs = new MutationObserver(() => {
      if (reported) {
        obs.disconnect();
        return;
      }
      scan();
    });
    obs.observe(document.documentElement, { subtree: true, childList: true });

    // Stop observing after 60s to avoid runaway CPU on weird pages.
    setTimeout(() => obs.disconnect(), 60_000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
