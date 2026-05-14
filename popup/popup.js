import { lookupDomain } from "../lib/domains.js";

const $ = (sel) => document.querySelector(sel);

const toggleEnabled = $("#toggle-enabled");
const manualInput = $("#manual-input");
const manualGo = $("#manual-go");
const manualResult = $("#manual-result");
const currentStatus = $("#current-status");
const historyList = $("#history-list");
const clearHistory = $("#clear-history");

function msg(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res);
    });
  });
}

function fmtTs(ts) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return "";
  }
}

function renderResult(box, result, inputUrl) {
  box.classList.remove("hidden", "ok", "fail");
  box.innerHTML = "";
  if (result.ok && result.url) {
    box.classList.add("ok");
    const a = document.createElement("a");
    a.href = result.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = result.url;
    const open = document.createElement("button");
    open.textContent = "Mở";
    open.style.marginLeft = "8px";
    open.addEventListener("click", () => chrome.tabs.create({ url: result.url, active: true }));
    const copy = document.createElement("button");
    copy.textContent = "Copy";
    copy.className = "link";
    copy.style.marginLeft = "4px";
    copy.addEventListener("click", () => navigator.clipboard.writeText(result.url));
    box.appendChild(a);
    box.appendChild(open);
    box.appendChild(copy);
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `qua ${result.source}`;
    box.appendChild(meta);
  } else {
    box.classList.add("fail");
    const reason = result.error || "không vượt được";
    box.textContent = `Lỗi: ${reason}`;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = inputUrl ? `URL: ${inputUrl}` : "";
    box.appendChild(meta);
  }
}

async function refreshSettings() {
  const res = await msg("get-settings");
  if (!res.ok) return;
  toggleEnabled.checked = !!res.settings.enabled;
  renderHistory(res.settings.history || []);
}

function renderHistory(history) {
  historyList.innerHTML = "";
  if (!history.length) {
    const li = document.createElement("li");
    li.style.color = "#94a3b8";
    li.textContent = "Chưa có lịch sử.";
    historyList.appendChild(li);
    return;
  }
  for (const h of history) {
    const li = document.createElement("li");
    const inEl = document.createElement("div");
    inEl.className = "in";
    inEl.textContent = h.input;
    const outEl = document.createElement("div");
    outEl.className = "out" + (h.ok ? "" : " fail");
    outEl.textContent = h.ok ? `→ ${h.output}` : `× ${h.error || "không vượt được"}`;
    const srcEl = document.createElement("div");
    srcEl.className = "src";
    srcEl.textContent = `${h.source || "?"} · ${fmtTs(h.ts)}`;
    li.appendChild(inEl);
    li.appendChild(outEl);
    li.appendChild(srcEl);
    historyList.appendChild(li);
  }
}

async function refreshCurrentTabStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      currentStatus.textContent = "—";
      return;
    }
    const entry = lookupDomain(tab.url);
    if (entry) {
      currentStatus.textContent = `${entry.label} · ${entry.strategy}`;
      currentStatus.className = "status-value supported";
    } else {
      currentStatus.textContent = "không phải link rút gọn được hỗ trợ";
      currentStatus.className = "status-value unsupported";
    }
  } catch {
    currentStatus.textContent = "—";
  }
}

toggleEnabled.addEventListener("change", async () => {
  await msg("set-settings", { patch: { enabled: toggleEnabled.checked } });
});

manualGo.addEventListener("click", async () => {
  const url = (manualInput.value || "").trim();
  if (!url) return;
  manualGo.disabled = true;
  manualResult.classList.remove("hidden");
  manualResult.classList.remove("ok", "fail");
  manualResult.textContent = "Đang vượt…";
  const res = await msg("bypass-manual", { url, force: false });
  manualGo.disabled = false;
  if (!res.ok) {
    renderResult(manualResult, { ok: false, error: res.error || "lỗi" }, url);
  } else {
    renderResult(manualResult, res.result, url);
    refreshSettings(); // refresh history
  }
});

manualInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") manualGo.click();
});

clearHistory.addEventListener("click", async () => {
  await msg("clear-history");
  await refreshSettings();
});

// Bootstrap.
refreshSettings();
refreshCurrentTabStatus();
