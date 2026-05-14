// Content script injected into known ad-link / shortener landing pages.
// Two jobs:
//   1) When the page renders the final destination link (e.g. a "Get Link" /
//      "Continue" button with an href), capture it and tell the background
//      service worker. The background script caches it and contributes back
//      to Crowd-Bypass.
//   2) Optionally auto-click obvious "skip / continue / get link" buttons
//      after a short delay so the user doesn't have to.
//
// The script is intentionally conservative — it only acts on a curated list of
// host patterns and well-known selectors to avoid breaking arbitrary pages.

(() => {
  const SAFE_LINK_SELECTORS = [
    "#go-link",
    "#showlink a",
    "#getlink a",
    "a#getlink",
    "a.get-link",
    "a.btn-captcha",
    "a[id*='getlink']",
    "a[id*='showlink']",
    "a[class*='get-link']",
    "a[data-cfemail]",
    "a[href][rel='nofollow'][target='_blank']",
  ];

  const AUTO_CLICK_TEXTS = [
    "get link",
    "continue",
    "skip",
    "skip ad",
    "lấy link",
    "vào link",
    "tiếp tục",
    "bỏ qua",
    "bỏ qua quảng cáo",
    "i'm a human",
    "i am human",
  ];

  let reported = false;

  function reportDestination(url) {
    if (reported) return;
    if (!url || !/^https?:\/\//i.test(url)) return;
    try {
      const u = new URL(url, location.href);
      if (u.hostname === location.hostname) return; // same site, not a real destination
      reported = true;
      chrome.runtime.sendMessage(
        { type: "content-found-destination", url: u.href },
        () => void chrome.runtime.lastError
      );
    } catch {
      // ignore
    }
  }

  function looksLikeButtonWithText(el, text) {
    if (!el) return false;
    const t = (el.innerText || el.textContent || "").trim().toLowerCase();
    if (!t) return false;
    return AUTO_CLICK_TEXTS.some((needle) => t.includes(needle));
  }

  function scan() {
    // 1) Look for explicit destination anchors.
    for (const sel of SAFE_LINK_SELECTORS) {
      const a = document.querySelector(sel);
      if (a && a.href) reportDestination(a.href);
    }

    // 2) Look at any anchor that contains "go to" / "get link" text and has an href.
    if (!reported) {
      const anchors = document.querySelectorAll("a[href]");
      for (const a of anchors) {
        if (looksLikeButtonWithText(a, AUTO_CLICK_TEXTS)) {
          reportDestination(a.href);
          if (reported) break;
        }
      }
    }

    // 3) Some sites embed the destination in a hidden input or data attribute.
    if (!reported) {
      const inputs = document.querySelectorAll(
        "input[type='hidden'][value^='http'], [data-url^='http'], [data-link^='http']"
      );
      for (const el of inputs) {
        const val = el.value || el.getAttribute("data-url") || el.getAttribute("data-link");
        if (val) reportDestination(val);
        if (reported) break;
      }
    }
  }

  // Initial scan + observe DOM changes.
  function start() {
    scan();
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
