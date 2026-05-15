// Service worker for the Vượt Link extension.
// - Watches navigations on supported shortener / ad-link domains.
// - Resolves the destination via lib/bypass.js.
// - Redirects the tab to the destination automatically when found.
// - When the API can't resolve, lets the page load and listens for the
//   content script to find the destination on-page; then auto-navigates
//   the tab and contributes back to Crowd-Bypass.
// - Handles popup/options messages for manual bypass, settings, logs,
//   and live tab status.

import { lookupDomain, listSupported } from "./lib/domains.js";
import { resolveLink, contributeToCrowd } from "./lib/bypass.js";

const DEFAULT_SETTINGS = {
  enabled: true,
  bypassVipKey: "",
  autoRedirect: true,
  // When the content script discovers the destination on the page, should
  // we automatically navigate the tab to it? Default: yes — this is the
  // main fix that makes ad-link sites actually "bypass" instead of just
  // logging the URL.
  redirectFromContent: true,
  showNotifications: false,
  disabledDomains: [],
  history: [], // {ts, input, output, source, ok, error}
  historyLimit: 50,
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h for successful resolves
const NEGATIVE_CACHE_TTL_MS = 1000 * 60 * 5; // 5 min for failures
const IN_FLIGHT = new Map(); // url -> Promise

// Per-tab state for live status display in the popup.
//   { stage: "resolving" | "waiting" | "found" | "failed" | "redirected",
//     inputUrl, outputUrl?, source?, error?, updatedAt }
const TAB_STATE = new Map();

function setTabState(tabId, patch) {
  if (typeof tabId !== "number" || tabId < 0) return;
  const prev = TAB_STATE.get(tabId) || {};
  const next = { ...prev, ...patch, updatedAt: Date.now() };
  TAB_STATE.set(tabId, next);
}

function clearTabState(tabId) {
  TAB_STATE.delete(tabId);
}

chrome.tabs.onRemoved.addListener((tabId) => clearTabState(tabId));

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

async function maybeResolve(inputUrl, { force = false } = {}) {
  if (!force) {
    const cached = await readCache(inputUrl);
    if (cached) return cached;
  }
  if (IN_FLIGHT.has(inputUrl)) return IN_FLIGHT.get(inputUrl);

  const p = (async () => {
    const settings = await getSettings();
    const result = await resolveLink(inputUrl, {
      bypassVipKey: settings.bypassVipKey || undefined,
    });
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

// -------- Web navigation listener --------

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // main frame only
  const url = details.url;
  if (!url || !/^https?:\/\//i.test(url)) return;

  const settings = await getSettings();
  if (!settings.enabled || !settings.autoRedirect) return;

  const entry = lookupDomain(url);
  if (!entry) return;
  if (isDomainDisabled(settings.disabledDomains, url)) return;

  setBadge(details.tabId, "…", "#ff9800");
  setTabState(details.tabId, {
    stage: "resolving",
    inputUrl: url,
    outputUrl: null,
    source: null,
    error: null,
  });

  const result = await maybeResolve(url);
  if (result.ok && result.url && result.url !== url) {
    try {
      await chrome.tabs.update(details.tabId, { url: result.url });
      setBadge(details.tabId, "✓", "#43a047");
      setTabState(details.tabId, {
        stage: "redirected",
        inputUrl: url,
        outputUrl: result.url,
        source: result.source,
      });
      notifyResolved(url, result);
      setTimeout(() => setBadge(details.tabId, "").catch(() => {}), 4000);
    } catch (e) {
      console.warn("[Vượt Link] tabs.update failed", e);
      setBadge(details.tabId, "!", "#e53935");
      setTabState(details.tabId, {
        stage: "failed",
        inputUrl: url,
        error: String((e && e.message) || e),
      });
    }
  } else {
    // Not found via API. Content script will try to handle it on the page.
    setBadge(details.tabId, "?", "#9e9e9e");
    setTabState(details.tabId, {
      stage: "waiting",
      inputUrl: url,
      error: result.error || null,
    });
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
        try {
          await chrome.storage.session.clear();
        } catch {}
        sendResponse({ ok: true });
      } else if (msg && msg.type === "supported-domains") {
        sendResponse({ ok: true, groups: listSupported() });
      } else if (msg && msg.type === "get-tab-status") {
        // Popup queries this for the active tab.
        const tabId = msg.tabId;
        const state = (typeof tabId === "number" && TAB_STATE.get(tabId)) || null;
        sendResponse({ ok: true, state });
      } else if (msg && msg.type === "content-progress") {
        // Heartbeat from content script — just update the tab state so the
        // popup can show "đang chờ trang load…" instead of stale "?".
        const tabId = sender && sender.tab && sender.tab.id;
        if (typeof tabId === "number") {
          const prev = TAB_STATE.get(tabId);
          // Don't downgrade a "redirected"/"found" state back to waiting.
          if (!prev || prev.stage === "resolving" || prev.stage === "waiting") {
            setTabState(tabId, {
              stage: "waiting",
              inputUrl: (sender.tab && sender.tab.url) || (prev && prev.inputUrl),
              contentStage: msg.stage || "waiting",
            });
          }
        }
        sendResponse({ ok: true });
      } else if (msg && msg.type === "content-found-destination") {
        // Content script discovered the destination on the page.
        // Cache it, contribute to Crowd-Bypass, and (if enabled) navigate
        // the tab to the destination so the user actually escapes the
        // ad-link site.
        const tab = sender && sender.tab;
        const tabId = tab && tab.id;
        const original = tab && tab.url;
        const settings = await getSettings();

        if (original && msg.url && lookupDomain(original)) {
          await writeCache(original, {
            ok: true,
            url: msg.url,
            source: "content-script",
          });
          await appendHistory({
            input: original,
            output: msg.url,
            source: `content-script (${msg.via || "scan"})`,
            ok: true,
          });
          contributeToCrowd(original, msg.url).catch(() => {});

          if (typeof tabId === "number") {
            setTabState(tabId, {
              stage: "found",
              inputUrl: original,
              outputUrl: msg.url,
              source: `content-script (${msg.via || "scan"})`,
            });
            setBadge(tabId, "✓", "#43a047");
            setTimeout(() => setBadge(tabId, "").catch(() => {}), 4000);
          }

          // The actual navigation. Guard against pathological cases:
          //   - same URL we're already on
          //   - destination is itself a known shortener pointing back here
          //   - extension or auto-redirect disabled
          //   - this specific domain is in the user's disabled list
          //   - tab no longer exists
          const stillSameDomain = lookupDomain(msg.url);
          const isLoop =
            msg.url === original ||
            (stillSameDomain && stillSameDomain.match === lookupDomain(original).match);

          if (
            settings.enabled &&
            settings.autoRedirect &&
            settings.redirectFromContent &&
            !isDomainDisabled(settings.disabledDomains, original) &&
            !isLoop &&
            typeof tabId === "number"
          ) {
            try {
              await chrome.tabs.update(tabId, { url: msg.url });
              setTabState(tabId, {
                stage: "redirected",
                inputUrl: original,
                outputUrl: msg.url,
                source: `content-script (${msg.via || "scan"})`,
              });
              notifyResolved(original, {
                ok: true,
                url: msg.url,
                source: "content-script",
              });
            } catch (e) {
              console.warn("[Vượt Link] redirectFromContent failed", e);
            }
          }
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
