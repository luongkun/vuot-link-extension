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

// Translate the raw error code from lib/bypass.js into a user-friendly Vietnamese message.
function translateError(code) {
  if (!code) return "Không vượt được link này.";
  const map = {
    "not-in-db":
      "Cộng đồng Crowd-Bypass chưa có dữ liệu cho link này. Hãy thử mở trang gốc — extension sẽ tự đóng góp lại lần sau.",
    "verify-required":
      "Cộng đồng yêu cầu xác minh thủ công cho link này. Hãy mở trang gốc và làm theo bước trên trang.",
    "free-api-disabled":
      "API miễn phí của bypass.vip đã ngừng. Hãy thử mở trang gốc, hoặc dùng API key Premium trong Cài đặt.",
    "unsupported-domain": "Tên miền này chưa được hỗ trợ.",
    "not-a-known-shortener": "Tên miền này chưa được hỗ trợ.",
    "bad-url": "URL không hợp lệ.",
    "empty-response": "Máy chủ trả về rỗng.",
    timeout: "Hết thời gian chờ. Kiểm tra mạng rồi thử lại.",
    "all-strategies-failed": "Tất cả phương pháp đều thất bại. Hãy mở trang gốc.",
    "hops-to-ad-link":
      "Link nhảy sang một trang quảng cáo trung gian — extension đang xử lý tiếp.",
  };
  if (map[code]) return map[code];
  if (code.startsWith("http-")) return `Máy chủ trả về lỗi (${code.replace("http-", "HTTP ")}).`;
  if (code.startsWith("no-redirect")) return "Link không chuyển hướng.";
  return code;
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
    open.addEventListener("click", () =>
      chrome.tabs.create({ url: result.url, active: true })
    );
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
    return;
  }

  // Failure path.
  box.classList.add("fail");
  const msgEl = document.createElement("div");
  msgEl.textContent = translateError(result.error);
  box.appendChild(msgEl);

  if (inputUrl) {
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `URL: ${inputUrl}`;
    box.appendChild(meta);
  }

  // Action buttons: "Mở trang gốc" + "Thử lại" — both useful when bypass fails.
  const actions = document.createElement("div");
  actions.className = "actions";

  if (inputUrl) {
    const openOriginal = document.createElement("button");
    openOriginal.type = "button";
    openOriginal.textContent = "Mở trang gốc";
    openOriginal.title =
      "Mở link rút gọn trong tab mới. Content script sẽ cố tự lấy link đích và đóng góp về Crowd-Bypass.";
    openOriginal.addEventListener("click", () =>
      chrome.tabs.create({ url: inputUrl, active: true })
    );
    actions.appendChild(openOriginal);

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "link";
    retry.textContent = "Thử lại";
    retry.addEventListener("click", async () => {
      manualResult.textContent = "Đang vượt lại…";
      manualResult.classList.remove("ok", "fail");
      const res = await msg("bypass-manual", { url: inputUrl, force: true });
      if (!res.ok) {
        renderResult(manualResult, { ok: false, error: res.error || "lỗi" }, inputUrl);
      } else {
        renderResult(manualResult, res.result, inputUrl);
        refreshSettings();
      }
    });
    actions.appendChild(retry);
  }

  box.appendChild(actions);
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
    outEl.textContent = h.ok
      ? `→ ${h.output}`
      : `× ${translateError(h.error)}`;
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
