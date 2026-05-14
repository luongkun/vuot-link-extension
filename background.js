// Service worker for the Vượt Link extension.
// - Watches navigations on supported shortener / ad-link domains.
// - Resolves the destination via lib/bypass.js (Crowd-Bypass + bypass.vip).
// - When API strategies don't have the link, falls back to a "headless"
//   bypass: open the URL in a minimized popup window, let content/redirect.js
//   click through countdown / get-link buttons, watch webNavigation for the
//   tab to leave the shortener registry — that's the destination — then
//   close the window and return the URL.
// - Redirects the original tab to the destination once known.
// - Handles popup/options messages for manual bypass, settings, and logs.

import { lookupDomain, listSupported } from "./lib/domains.js";
import { resolveLink, contributeToCrowd } from "./lib/bypass.js";

const DEFAULT_SETTINGS = {
  enabled: true,
  bypassVipKey: "",
  autoRedirect: true,
  showNotifications: false,
  // Open the URL in a hidden popup window and let the content script click
  // through "Get link / Tiếp tục / Bỏ qua" buttons when API strategies fail.
  headlessResolveEnabled: true,
  disabledDomains: [],
  history: [], // {ts, input, output, source, ok, error}
  historyLimit: 50,
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h for successful resolves
const NEGATIVE_CACHE_TTL_MS = 1000 * 60 * 5; // 5 min for failures
const HEADLESS_TIMEOUT_MS = 60 * 1000; // 60s upper bound for the headless flow
const IN_FLIGHT = new Map(); // url -> Promise

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set(patch);
  return next;
}

async function appendHistory(entry) {
  const { history, historyLimit } = await getSettings();
  const next = [{ ts: Date.now(), ...entry }, ...history].slice(0, historyLimit);
  await chrome.storage.local.set({ history: next });
}

async function readCache(url) {
  try {
    const key = `cache:${url}`;
    const got = await chrome.storage.session.get(key);
    const hit = got[key];
    if (!hit) return null;
    const ttl = hit.ok ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
    if (Date.now() - hit.ts < ttl) return hit;
  } catch {
    // session storage not available in some contexts; ignore.
  }
  return null;
}

async function writeCache(url, payload) {
  try {
    const key = `cache:${url}`;
    await chrome.storage.session.set({ [key]: { ts: Date.now(), ...payload } });
  } catch {
    // ignore
  }
}

function isDomainDisabled(disabledDomains, urlString) {
  const entry = lookupDomain(urlString);
  if (!entry) return false;
  return disabledDomains.includes(entry.match);
}

// ====================== HEADLESS RESOLVE ======================
//
// Open `originalUrl` inside a minimized popup window. Watch every main-frame
// navigation in that tab; the first URL that's NOT a known shortener IS the
// real destination. The content script may also report it directly via a
// `content-found-destination` message (e.g. when the page renders the link
// without actually navigating to it).

const HEADLESS = {
  byTab: new Map(), // tabId  -> state
  byWindow: new Map(), // windowId -> tabId
};

async function createHeadlessWindow(url) {
  // Try the cleanest combinations first; some platforms (Linux/X11, certain
  // Wayland compositors) reject certain combos.
  const attempts = [
    { url, type: "popup", state: "minimized", focused: false, width: 480, height: 360 },
    { url, type: "popup", state: "minimized", width: 480, height: 360 },
    { url, type: "popup", focused: false, top: 9999, left: 9999, width: 480, height: 360 },
    { url, type: "popup", width: 480, height: 360 },
  ];
  let lastErr;
  for (const opts of attempts) {
    try {
      return await chrome.windows.create(opts);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("windows.create failed");
}

async function headlessResolve(originalUrl) {
  let win;
  try {
    win = await createHeadlessWindow(originalUrl);
  } catch (e) {
    return {
      ok: false,
      source: "headless",
      error: "cannot-open-window: " + ((e && e.message) || e),
    };
  }
  const tab = win && win.tabs && win.tabs[0];
  if (!tab || !tab.id || !win.id) {
    if (win && win.id) {
      try { await chrome.windows.remove(win.id); } catch {}
    }
    return { ok: false, source: "headless", error: "no-tab" };
  }
  const tabId = tab.id;
  const winId = win.id;

  return new Promise((resolve) => {
    const state = {
      origUrl: originalUrl,
      settled: false,
      foundUrl: null,
      timeoutId: null,
      cleanup: null,
      pendingTimer: null,
    };

    const cleanup = async (result) => {
      if (state.settled) return;
      state.settled = true;
      clearTimeout(state.timeoutId);
      clearTimeout(state.pendingTimer);
      HEADLESS.byTab.delete(tabId);
      HEADLESS.byWindow.delete(winId);
      try { await chrome.windows.remove(winId); } catch {}
      resolve(result);
    };

    state.cleanup = cleanup;
    HEADLESS.byTab.set(tabId, state);
    HEADLESS.byWindow.set(winId, tabId);

    state.timeoutId = setTimeout(() => {
      cleanup({
        ok: !!state.foundUrl,
        url: state.foundUrl || undefined,
        source: "headless",
        error: state.foundUrl ? undefined : "headless-timeout",
      });
    }, HEADLESS_TIMEOUT_MS);
  });
}

// Settle a headless resolution after seeing a candidate URL. Wait briefly
// in case the candidate itself redirects again.
function settleHeadless(state, url, sourceLabel) {
  if (!state || state.settled) return;
  state.foundUrl = url;
  clearTimeout(state.pendingTimer);
  state.pendingTimer = setTimeout(() => {
    if (state.settled) return;
    state.cleanup({ ok: true, url: state.foundUrl, source: sourceLabel });
  }, 500);
}

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  const state = HEADLESS.byTab.get(details.tabId);
  if (!state || state.settled) return;
  const url = details.url;
  if (!url) return;
  if (/^(about:|chrome:|chrome-extension:|edge:|brave:|data:|file:)/i.test(url)) return;
  if (url === state.origUrl) return;
  // Still on a known shortener? Keep waiting.
  if (lookupDomain(url)) return;
  settleHeadless(state, url, "headless");
});

// Close ad-popups (window.open from inside a headless tab) so we don't leak
// extra browser windows while bypassing.
chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  if (HEADLESS.byTab.has(details.sourceTabId)) {
    chrome.tabs.remove(details.tabId).catch(() => {});
  }
});

// User (or our cleanup) closed the headless window — settle whatever we have.
chrome.windows.onRemoved.addListener((winId) => {
  const tabId = HEADLESS.byWindow.get(winId);
  if (!tabId) return;
  const state = HEADLESS.byTab.get(tabId);
  if (!state) return;
  // If `cleanup` is already in progress it will resolve itself; just bail.
  if (state.settled) return;
  state.cleanup({
    ok: !!state.foundUrl,
    url: state.foundUrl || undefined,
    source: "headless",
    error: state.foundUrl ? undefined : "window-closed",
  });
});

// ====================== END HEADLESS ======================

async function maybeResolve(inputUrl, { force = false, useHeadless } = {}) {
  if (!force) {
    const cached = await readCache(inputUrl);
    if (cached) return cached;
  }
  if (IN_FLIGHT.has(inputUrl)) return IN_FLIGHT.get(inputUrl);

  const p = (async () => {
    const settings = await getSettings();
    const allowHeadless =
      typeof useHeadless === "boolean" ? useHeadless : !!settings.headlessResolveEnabled;

    let result = await resolveLink(inputUrl, {
      bypassVipKey: settings.bypassVipKey || undefined,
    });

    // API strategies didn't find it — fall back to headless bypass.
    if (!result.ok && allowHeadless) {
      const entry = lookupDomain(inputUrl);
      // Only useful for "ad-link" type sites (crowd / api strategies).
      if (entry && entry.strategy !== "redirect") {
        const headless = await headlessResolve(inputUrl);
        if (headless.ok) {
          // Contribute back so future Crowd-Bypass queries succeed for everyone.
          contributeToCrowd(inputUrl, headless.url).catch(() => {});
          result = {
            ok: true,
            url: headless.url,
            source: headless.source,
            attempts: [...(result.attempts || []), headless],
          };
        } else {
          result = {
            ...result,
            attempts: [...(result.attempts || []), headless],
          };
        }
      }
    }

    await writeCache(inputUrl, result);
    await appendHistory({
      input: inputUrl,
      output: result.url || null,
      source: result.source,
      ok: !!result.ok,
      error: result.error || null,
    });
    return result;
  })();
  IN_FLIGHT.set(inputUrl, p);
  try {
    return await p;
  } finally {
    IN_FLIGHT.delete(inputUrl);
  }
}

async function setBadge(tabId, text, color = "#1e88e5") {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
  } catch {}
}

async function notifyResolved(inputUrl, result) {
  const settings = await getSettings();
  if (!settings.showNotifications) return;
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: result.ok ? "Vượt Link: thành công" : "Vượt Link: thất bại",
      message: result.ok
        ? `→ ${result.url}\n(qua ${result.source})`
        : `${inputUrl}\nLỗi: ${result.error}`,
    });
  } catch {}
}

// -------- Web navigation listener (auto-redirect for top-level navigations) --------
//
// IMPORTANT: do NOT trigger headless from here. The user is already navigating
// to the page; let the in-page content script auto-click through. We only
// auto-redirect when the API can resolve the URL instantly (cache or fast hit).

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // main frame only
  const url = details.url;
  if (!url || !/^https?:\/\//i.test(url)) return;

  // Skip if this navigation is happening inside one of our own headless tabs.
  if (HEADLESS.byTab.has(details.tabId)) return;

  const settings = await getSettings();
  if (!settings.enabled || !settings.autoRedirect) return;

  const entry = lookupDomain(url);
  if (!entry) return;
  if (isDomainDisabled(settings.disabledDomains, url)) return;

  setBadge(details.tabId, "…", "#ff9800");

  // For auto-redirect we explicitly disable headless (we're already on the page).
  const result = await maybeResolve(url, { useHeadless: false });
  if (result.ok && result.url && result.url !== url) {
    try {
      await chrome.tabs.update(details.tabId, { url: result.url });
      setBadge(details.tabId, "✓", "#43a047");
      notifyResolved(url, result);
      setTimeout(() => setBadge(details.tabId, "").catch(() => {}), 4000);
    } catch (e) {
      console.warn("[Vượt Link] tabs.update failed", e);
      setBadge(details.tabId, "!", "#e53935");
    }
  } else {
    // Not found via API. Content script will try to handle it on the page.
    setBadge(details.tabId, "?", "#9e9e9e");
    setTimeout(() => setBadge(details.tabId, "").catch(() => {}), 4000);
  }
});

// -------- Message handlers --------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === "bypass-manual") {
        const res = await maybeResolve(msg.url, { force: !!msg.force });
        sendResponse({ ok: true, result: res });
      } else if (msg && msg.type === "get-settings") {
        sendResponse({ ok: true, settings: await getSettings() });
      } else if (msg && msg.type === "set-settings") {
        const next = await setSettings(msg.patch || {});
        sendResponse({ ok: true, settings: next });
      } else if (msg && msg.type === "clear-history") {
        await chrome.storage.local.set({ history: [] });
        sendResponse({ ok: true });
      } else if (msg && msg.type === "clear-cache") {
        try { await chrome.storage.session.clear(); } catch {}
        sendResponse({ ok: true });
      } else if (msg && msg.type === "supported-domains") {
        sendResponse({ ok: true, groups: listSupported() });
      } else if (msg && msg.type === "content-found-destination") {
        const senderTab = sender && sender.tab;
        const senderTabId = senderTab && senderTab.id;
        const original = senderTab && senderTab.url;

        // 1) If this came from a headless tab we control, settle the resolver.
        if (senderTabId && HEADLESS.byTab.has(senderTabId)) {
          const state = HEADLESS.byTab.get(senderTabId);
          settleHeadless(state, msg.url, "headless+content");
        }

        // 2) Cache + contribute back to Crowd-Bypass so the next user gets a
        //    fast hit without needing the headless dance.
        if (original && msg.url && lookupDomain(original)) {
          await writeCache(original, {
            ok: true,
            url: msg.url,
            source: "content-script",
          });
          await appendHistory({
            input: original,
            output: msg.url,
            source: "content-script",
            ok: true,
          });
          contributeToCrowd(original, msg.url).catch(() => {});
        }
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "unknown-message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // keep channel open for async sendResponse
});

// -------- Context menu --------

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: "vuotlink-resolve-link",
      title: "Vượt link này (Vượt Link)",
      contexts: ["link"],
    });
    chrome.contextMenus.create({
      id: "vuotlink-resolve-page",
      title: "Vượt link của trang hiện tại",
      contexts: ["page"],
    });
  } catch (e) {
    console.warn("[Vượt Link] context menu init failed", e);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const target = info.menuItemId === "vuotlink-resolve-link" ? info.linkUrl : (tab && tab.url);
  if (!target) return;
  const res = await maybeResolve(target);
  if (res.ok && res.url) {
    chrome.tabs.create({ url: res.url, active: true });
  } else {
    notifyResolved(target, res);
  }
});
