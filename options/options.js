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

const $ = (sel) => document.querySelector(sel);
const fields = {
  enabled: $("#enabled"),
  autoRedirect: $("#autoRedirect"),
  showNotifications: $("#showNotifications"),
  bypassVipKey: $("#bypassVipKey"),
};
const toast = $("#save-toast");
let _domainGroups = null;

function showToast(text = "Đã lưu.") {
  toast.textContent = text;
  toast.classList.add("show");
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 200);
  }, 1500);
}

function bindAutoSave(input, key, type = "boolean") {
  input.addEventListener("change", async () => {
    const value = type === "boolean" ? input.checked : input.value;
    const res = await msg("set-settings", { patch: { [key]: value } });
    if (res.ok) showToast();
  });
  if (type !== "boolean") {
    let debounce;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        await msg("set-settings", { patch: { [key]: input.value } });
        showToast("Đã lưu API key.");
      }, 500);
    });
  }
}

function renderDomains(groups, disabledDomains) {
  const wrap = $("#domain-groups");
  wrap.innerHTML = "";
  const titles = {
    redirect: "Shortener (HEAD redirect)",
    crowd: "Ad-link (Crowd-Bypass)",
    api: "Khác",
  };
  for (const [key, list] of Object.entries(groups)) {
    if (!list || !list.length) continue;
    const title = document.createElement("div");
    title.className = "domain-group-title";
    title.textContent = titles[key] || key;
    wrap.appendChild(title);
    for (const entry of list) {
      const label = document.createElement("label");
      label.className = "row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !disabledDomains.includes(entry.match);
      cb.dataset.match = entry.match;
      cb.addEventListener("change", async () => {
        const current = await msg("get-settings");
        if (!current.ok) return;
        const disabled = new Set(current.settings.disabledDomains || []);
        if (cb.checked) disabled.delete(entry.match);
        else disabled.add(entry.match);
        await msg("set-settings", { patch: { disabledDomains: [...disabled] } });
        showToast();
      });
      const span = document.createElement("span");
      span.textContent = `${entry.label} (${entry.match})`;
      label.appendChild(cb);
      label.appendChild(span);
      wrap.appendChild(label);
    }
  }
}

async function bootstrap() {
  const s = await msg("get-settings");
  if (!s.ok) return;
  fields.enabled.checked = !!s.settings.enabled;
  fields.autoRedirect.checked = !!s.settings.autoRedirect;
  fields.showNotifications.checked = !!s.settings.showNotifications;
  fields.bypassVipKey.value = s.settings.bypassVipKey || "";

  bindAutoSave(fields.enabled, "enabled");
  bindAutoSave(fields.autoRedirect, "autoRedirect");
  bindAutoSave(fields.showNotifications, "showNotifications");
  bindAutoSave(fields.bypassVipKey, "bypassVipKey", "string");

  const d = await msg("supported-domains");
  if (d.ok) {
    _domainGroups = d.groups;
    renderDomains(d.groups, s.settings.disabledDomains || []);
  }
}

$("#clear-cache").addEventListener("click", async () => {
  await msg("clear-cache");
  showToast("Đã xoá cache.");
});

$("#clear-history").addEventListener("click", async () => {
  await msg("clear-history");
  showToast("Đã xoá lịch sử.");
});

bootstrap();
