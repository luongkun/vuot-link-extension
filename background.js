// Service worker for the Vượt Link extension.
// - Watches navigations on supported shortener / ad-link domains.
// - Resolves the destination via lib/bypass.js.
// - Redirects the tab to the destination automatically when found.
// - Otherwise falls back to the normal page (and content/redirect.js may help).
// - Handles popup/options messages for manual bypass, settings, and logs.

import { lookupDomain, listSupported } from "./lib/domains.js";
import { resolveLink, contributeToCrowd } from "./lib/bypass.js";

const DEFAULT_SETTINGS = {
  enabled: true,
  bypassVipKey: "",
  autoRedirect: true,
  showNotifications: false,
  disabledDomains: [],
  history: [], // {ts, input, output, source, ok, error}
  historyLimit: 50,
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h for successful resolves
const NEGATIVE_CACHE_TTL_MS = 1000 * 60 * 5; // 5 min for failures, so the user can retry
                                              // soon (e.g. after the Crowd-Bypass DB is updated)
                                              // but we don't hammer the API on every navigation.
const IN_FLIGHT = new Map(); // url -> Promise

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  // Don't persist transient defaults if nothing changed.
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

  const result = await maybeResolve(url);
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
        try {
          await chrome.storage.session.clear();
        } catch {}
        sendResponse({ ok: true });
      } else if (msg && msg.type === "supported-domains") {
        sendResponse({ ok: true, groups: listSupported() });
      } else if (msg && msg.type === "content-found-destination") {
        // content script discovered the destination on the page.
        // Cache it + contribute to crowd.
        const original = sender && sender.tab && sender.tab.url;
        if (original && msg.url && lookupDomain(original)) {
          await writeCache(original, { ok: true, url: msg.url, source: "content-script" });
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
