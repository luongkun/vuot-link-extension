// Content script injected into known ad-link / shortener landing pages.
//
// Pipeline:
//   1) Site-specific "solver" — for a handful of well-known sites we know
//      exactly how to grab the destination (e.g. yeumoney prints it into
//      `#showlink` after the countdown). Solvers run in parallel with the
//      generic scanner.
//   2) Generic scanner — walks the DOM looking for anchors / inputs that
//      look like the final destination. Runs on every mutation.
//   3) Auto-click — clicks "Get Link / Lấy link / Continue / Skip" buttons
//      on a slow schedule so we ride out countdown timers.
//   4) Reporting — when we have a candidate URL, send it to the background
//      service worker, which (a) caches it, (b) contributes to Crowd-Bypass
//      and (c) — if `redirectFromContent` is enabled — navigates the tab.
//
// The script only runs on the curated host allowlist in manifest.json.

(() => {
  // -------- Tunables --------

  // Auto-click times (ms after document_start). Spread out so we ride out
  // 5s, 10s, 15s, 30s countdowns common on Vietnamese ad-link sites.
  const AUTO_CLICK_DELAYS = [
    1500, 4000, 8000, 12000, 18000, 25000, 35000, 50000, 70000,
  ];

  // How long to keep the MutationObserver alive (ms). 90s covers most
  // long countdowns; we tear it down after that to save CPU.
  const OBSERVER_LIFETIME_MS = 90_000;

  // Heartbeat so the background SW knows this content script is still
  // working on the page (used to drive the popup status).
  const HEARTBEAT_INTERVAL_MS = 2000;

  // Strong indicators that an anchor is the final destination.
  const SAFE_LINK_SELECTORS = [
    "#go-link a[href]",
    "a#go-link[href]",
    "#showlink a[href]",
    "a#showlink[href]",
    "#getlink a[href]",
    "a#getlink[href]",
    "#download a[href]",
    "a#download[href]",
    "a.get-link[href]",
    "a.btn-captcha[href]",
    "a[id*='getlink'][href]",
    "a[id*='showlink'][href]",
    "a[id*='go-link'][href]",
    "a[class*='get-link'][href]",
    "a.download[href]",
    ".final-link a[href]",
    "#final-link[href]",
    "a#final-link[href]",
  ];

  const AUTO_CLICK_TEXTS = [
    "get link",
    "continue",
    "skip",
    "skip ad",
    "skip ads",
    "lấy link",
    "lay link",
    "vào link",
    "vao link",
    "tiếp tục",
    "tiep tuc",
    "bỏ qua",
    "bo qua",
    "bỏ qua quảng cáo",
    "bo qua quang cao",
    "i'm a human",
    "i am human",
    "click here to continue",
    "go to link",
    "verify",
    "đi tới link",
    "di toi link",
    "nhận link",
    "nhan link",
    "tải về",
    "tai ve",
  ];

  // Sites where auto-click is risky (Linkvertise / Work.ink show captchas).
  const NO_AUTO_CLICK_HOSTS = [
    "linkvertise.com",
    "link-to.net",
    "linkvertise.net",
    "work.ink",
  ];

  // Hosts that are clearly ads/trackers — never accept these as the "final"
  // destination even if a button text suggests so.
  const AD_TRACKER_HOST_RE = new RegExp(
    [
      "doubleclick\\.net",
      "googlesyndication",
      "googleadservices",
      "googletagmanager",
      "googletagservices",
      "google-analytics",
      "adservice\\.google",
      "adsterra",
      "propellerads",
      "popads",
      "popcash",
      "popmyads",
      "exoclick",
      "exosrv",
      "juicyads",
      "adcash",
      "adnxs",
      "trafficjunky",
      "clickadu",
      "adsterra\\.com",
      "ad-maven",
      "outbrain",
      "taboola",
      "mgid\\.com",
      "revcontent",
      "criteo",
      "smartadserver",
      "yandex\\.ru/an",
      "facebook\\.com/tr",
      "bing\\.com/action",
      "rlcdn\\.com",
      "scorecardresearch",
      "quantserve",
      "mathtag",
      "moatads",
      "rubiconproject",
      "openx\\.net",
      "casalemedia",
      "pubmatic",
      "adsymptotic",
      "bidswitch",
      "krxd\\.net",
      "demdex",
      "adroll",
    ].join("|"),
    "i"
  );

  // Hosts that often appear as "skip-ad" landing pages but are NOT the
  // user's destination.
  const KNOWN_INTERSTITIAL_HOST_RE = /(linkvertise|work\.ink|adfoc|adf\.ly|ouo\.|shorte\.st|sh\.st|exee?\.io|exee\.app|exey\.io|owolinks|droplink|cuty\.io|cety\.io|boost\.ink|loot-link|lootdest|lootlabs|paster\.|sub2unlock|sub4unlock|rekonise|mboost|social-unlock|link1s|link4m|yeumoney|kiemtien|megaurl)/i;

  // -------- Helpers --------

  const host = location.hostname.toLowerCase();
  const baseHost = host.replace(/^www\./, "");
  const autoClickAllowed = !NO_AUTO_CLICK_HOSTS.some(
    (h) => host === h || host.endsWith("." + h)
  );

  let reported = false;
  let userInteracted = false;
  const clicked = new WeakSet();

  // Track whether the user (or our auto-click) has ever fired a click on
  // the page. Until that happens, we DON'T accept arbitrary external
  // anchors as the destination — they're almost certainly banner ads.
  const markInteracted = () => (userInteracted = true);
  document.addEventListener("click", markInteracted, true);
  document.addEventListener("submit", markInteracted, true);

  function safeUrl(raw) {
    if (!raw || typeof raw !== "string") return null;
    if (!/^https?:\/\//i.test(raw)) return null;
    try {
      return new URL(raw, location.href);
    } catch {
      return null;
    }
  }

  function isAcceptableDestination(u, { trusted = false } = {}) {
    if (!u) return false;
    // Same site -> never the destination.
    if (u.hostname === location.hostname) return false;
    if (u.hostname.replace(/^www\./, "") === baseHost) return false;
    // Ad / tracker -> never.
    if (AD_TRACKER_HOST_RE.test(u.hostname)) return false;
    // Another shortener -> only accept if we got it from a trusted source
    // (e.g. site-specific solver). The background script will resolve it
    // again in the next hop.
    if (!trusted && KNOWN_INTERSTITIAL_HOST_RE.test(u.hostname)) return false;
    // For untrusted candidates require that the user (or auto-click) has
    // actually interacted with the page. Random anchors that exist on the
    // page on first paint are almost always banners.
    if (!trusted && !userInteracted) return false;
    return true;
  }

  function reportDestination(rawUrl, { trusted = false, source = "scan" } = {}) {
    if (reported) return;
    const u = safeUrl(rawUrl);
    if (!u) return;
    if (!isAcceptableDestination(u, { trusted })) return;
    reported = true;
    try {
      chrome.runtime.sendMessage(
        {
          type: "content-found-destination",
          url: u.href,
          via: source,
          host: location.host,
        },
        () => void chrome.runtime.lastError
      );
    } catch {
      // ignore
    }
  }

  function reportProgress(stage, extra = {}) {
    try {
      chrome.runtime.sendMessage(
        { type: "content-progress", stage, host: location.host, ...extra },
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
    if (!t || t.length > 80) return false;
    return AUTO_CLICK_TEXTS.some((needle) => t.includes(needle));
  }

  function safeClick(el) {
    if (!el || clicked.has(el)) return false;
    if (el.disabled) return false;
    if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return false;
    // Skip elements that are visibly hidden.
    const rect = el.getBoundingClientRect && el.getBoundingClientRect();
    if (rect && rect.width === 0 && rect.height === 0) return false;
    clicked.add(el);
    try {
      el.click();
      userInteracted = true;
      return true;
    } catch {
      return false;
    }
  }

  function tryAutoClick() {
    if (!autoClickAllowed || reported) return;
    // Buttons + JS anchors with relevant text. Anchors with real http hrefs
    // are NOT auto-clicked (would navigate to ads).
    const candidates = document.querySelectorAll(
      [
        "button",
        "a[href='#']",
        "a[href='javascript:void(0)']",
        "a[href='javascript:;']",
        "a[role='button']",
        "input[type='button']",
        "input[type='submit']",
        "[onclick]",
      ].join(",")
    );
    let clickedAny = false;
    for (const el of candidates) {
      if (matchesAutoClick(el)) {
        if (safeClick(el)) clickedAny = true;
      }
    }
    if (clickedAny) reportProgress("auto-click");
  }

  function urlInText(text) {
    if (!text || typeof text !== "string") return null;
    const m = text.match(/https?:\/\/[^\s"'<>]+/i);
    return m ? m[0] : null;
  }

  // -------- Generic scanner --------

  function scan() {
    if (reported) return;

    // 1) Strong-signal selectors.
    for (const sel of SAFE_LINK_SELECTORS) {
      const a = document.querySelector(sel);
      if (a && a.href) {
        // These selectors target containers the site itself uses for the
        // final URL — treat as trusted.
        reportDestination(a.href, { trusted: true, source: "selector" });
        if (reported) return;
      }
    }

    // 2) Anchors whose visible text matches an "open link / continue" phrase.
    //    These are user-clickable destinations; only accept post-interaction.
    const anchors = document.querySelectorAll("a[href^='http']");
    for (const a of anchors) {
      if (matchesAutoClick(a)) {
        reportDestination(a.href, { source: "anchor-text" });
        if (reported) return;
      }
    }

    // 3) Hidden inputs / data attributes.
    const inputs = document.querySelectorAll(
      [
        "input[type='hidden'][value^='http']",
        "input[readonly][value^='http']",
        "textarea",
        "[data-url^='http']",
        "[data-link^='http']",
        "[data-href^='http']",
        "[data-target^='http']",
      ].join(",")
    );
    for (const el of inputs) {
      const val =
        el.value ||
        el.getAttribute("data-url") ||
        el.getAttribute("data-link") ||
        el.getAttribute("data-href") ||
        el.getAttribute("data-target") ||
        el.textContent;
      const found = urlInText(val);
      if (found) {
        reportDestination(found, { trusted: true, source: "data-attr" });
        if (reported) return;
      }
    }
  }

  // -------- Site-specific solvers --------
  //
  // Each entry: { match: RegExp tested against host, run: () => void }
  // Solvers can either report directly (trusted) or trigger DOM actions that
  // the generic scanner will pick up.

  const SOLVERS = [
    // ---- Yeumoney / Kiemtien* family — "Get Link" countdown ----
    {
      match: /(^|\.)yeumoney\.com$|(^|\.)kiemtienol\.com$|(^|\.)kiemtienmod\.net$|(^|\.)kiemtien\.gg$|(^|\.)kiemtienbank\.com$/,
      run: () => {
        // After countdown, these sites set #showlink innerHTML to <a href="...">
        // Watch for it directly.
        const tryRead = () => {
          const a =
            document.querySelector("#showlink a[href^='http']") ||
            document.querySelector("a#showlink[href^='http']") ||
            document.querySelector(".showlink a[href^='http']") ||
            document.querySelector("#go-link a[href^='http']");
          if (a && a.href) {
            reportDestination(a.href, { trusted: true, source: "yeumoney-solver" });
            return true;
          }
          return false;
        };
        const id = setInterval(() => {
          if (reported || tryRead()) clearInterval(id);
        }, 1000);
        setTimeout(() => clearInterval(id), 60_000);
      },
    },

    // ---- link1s / link4m / link1s.net — token + Get Link button ----
    {
      match: /(^|\.)link1s\.com$|(^|\.)link1s\.net$|(^|\.)link4m\.com$|(^|\.)link4m\.net$/,
      run: () => {
        // These render <a id="link-view" href="..."> after countdown, OR
        // submit a form to /links/go with a token and respond with the URL.
        const tryRead = () => {
          const a =
            document.querySelector("#link-view[href^='http']") ||
            document.querySelector("a#link-view[href^='http']") ||
            document.querySelector("a[id^='link-view'][href^='http']") ||
            document.querySelector("#showlink a[href^='http']") ||
            document.querySelector(".final-link a[href^='http']");
          if (a && a.href) {
            reportDestination(a.href, { trusted: true, source: "link1s-solver" });
            return true;
          }
          return false;
        };
        const id = setInterval(() => {
          if (reported || tryRead()) clearInterval(id);
        }, 1000);
        setTimeout(() => clearInterval(id), 60_000);
      },
    },

    // ---- megaurl.in ----
    {
      match: /(^|\.)megaurl\.in$/,
      run: () => {
        const tryRead = () => {
          const a =
            document.querySelector("#download a[href^='http']") ||
            document.querySelector("a#download[href^='http']") ||
            document.querySelector(".final-link a[href^='http']");
          if (a && a.href) {
            reportDestination(a.href, { trusted: true, source: "megaurl-solver" });
            return true;
          }
          return false;
        };
        const id = setInterval(() => {
          if (reported || tryRead()) clearInterval(id);
        }, 1000);
        setTimeout(() => clearInterval(id), 60_000);
      },
    },

    // ---- ouo.io / ouo.press — countdown + go button ----
    {
      match: /(^|\.)ouo\.io$|(^|\.)ouo\.press$/,
      run: () => {
        // ouo redirects via meta refresh / window.location after countdown.
        // Hook history & location to catch the navigation target.
        const tryRead = () => {
          // Sometimes the destination shows up in a button's onclick.
          const btn = document.querySelector("button[onclick*='http']");
          if (btn) {
            const m = (btn.getAttribute("onclick") || "").match(/https?:\/\/[^"'\s]+/);
            if (m) {
              reportDestination(m[0], { trusted: true, source: "ouo-solver" });
              return true;
            }
          }
          return false;
        };
        const id = setInterval(() => {
          if (reported || tryRead()) clearInterval(id);
        }, 1000);
        setTimeout(() => clearInterval(id), 60_000);
      },
    },

    // ---- exe.io / exey.io / exee.io / exee.app / owolinks / droplink ----
    {
      match: /(^|\.)exe\.io$|(^|\.)exey\.io$|(^|\.)exee\.io$|(^|\.)exee\.app$|(^|\.)owolinks\.com$|(^|\.)droplink\.co$|(^|\.)cuty\.io$|(^|\.)cety\.io$/,
      run: () => {
        const tryRead = () => {
          const a =
            document.querySelector("a#invisibleCaptchaShortlink[href^='http']") ||
            document.querySelector("a#getlink[href^='http']") ||
            document.querySelector("#showlink a[href^='http']") ||
            document.querySelector(".get-link[href^='http']");
          if (a && a.href) {
            reportDestination(a.href, { trusted: true, source: "exeio-solver" });
            return true;
          }
          return false;
        };
        const id = setInterval(() => {
          if (reported || tryRead()) clearInterval(id);
        }, 1000);
        setTimeout(() => clearInterval(id), 60_000);
      },
    },
  ];

  function runSolvers() {
    for (const s of SOLVERS) {
      if (s.match.test(host)) {
        try {
          s.run();
        } catch (e) {
          // ignore solver crashes
        }
      }
    }
  }

  // -------- Boot --------

  function start() {
    reportProgress("started");
    scan();
    runSolvers();

    for (const delay of AUTO_CLICK_DELAYS) {
      setTimeout(() => {
        if (reported) return;
        tryAutoClick();
        scan();
      }, delay);
    }

    const obs = new MutationObserver(() => {
      if (reported) {
        obs.disconnect();
        return;
      }
      scan();
    });
    obs.observe(document.documentElement, { subtree: true, childList: true });
    setTimeout(() => obs.disconnect(), OBSERVER_LIFETIME_MS);

    // Heartbeat so the popup can show "đang xử lý…" while the page is open.
    const hb = setInterval(() => {
      if (reported) {
        clearInterval(hb);
        return;
      }
      reportProgress("waiting");
    }, HEARTBEAT_INTERVAL_MS);
    setTimeout(() => clearInterval(hb), OBSERVER_LIFETIME_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
