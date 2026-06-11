const PRESETS = {
  broadcast: { preset: "broadcast", label: "broadcast", mode: "feed", max: 6, fade: 0, scale: 1, align: "top", sources: ["twitch", "youtube", "x", "xlive", "kick"] },
  ticker: { preset: "ticker", label: "ticker", mode: "feed", max: 3, fade: 35, scale: 0.8, align: "bottom", sources: ["x", "xlive", "youtube", "kick", "twitch"] },
  approved: { preset: "approved", label: "approved", mode: "approved", approvedOnly: true, max: 8, fade: 0, scale: 1.05, align: "top", sources: ["twitch", "youtube", "x", "xlive", "kick"] },
  moments: { preset: "moments", label: "moments", mode: "moments", max: 5, fade: 0, scale: 1.08, align: "top", sources: ["twitch", "youtube", "x", "xlive", "kick"] },
  questions: { preset: "questions", label: "questions", mode: "questions", max: 9, fade: 0, scale: 1.1, align: "bottom", sources: ["twitch", "youtube", "kick", "x", "xlive"] }
};

const els = {
  presets: [...document.querySelectorAll("[data-cfg-preset]")],
  presetOut: document.querySelector("#cfgPresetOut"),
  max: document.querySelector("#cfgMax"),
  maxOut: document.querySelector("#cfgMaxOut"),
  fade: document.querySelector("#cfgFade"),
  fadeOut: document.querySelector("#cfgFadeOut"),
  scale: document.querySelector("#cfgScale"),
  scaleOut: document.querySelector("#cfgScaleOut"),
  sources: [...document.querySelectorAll("[data-cfg-source]")],
  alignButtons: [...document.querySelectorAll("[data-cfg-align]")],
  url: document.querySelector("#cfgUrl"),
  copy: document.querySelector("#cfgCopy"),
  preview: document.querySelector("#cfgPreview"),
  toastRoot: document.querySelector("#toastRoot")
};

let align = "top";
let mode = "feed";
let approvedOnly = false;
let preset = "broadcast";
let previewTimer = null;

for (const input of [els.max, els.fade, els.scale]) {
  input?.addEventListener("input", () => {
    markCustomPreset();
    update();
  });
}
for (const box of els.sources) {
  box.addEventListener("change", () => {
    markCustomPreset();
    update();
  });
}
for (const button of els.presets) {
  button.addEventListener("click", () => applyPreset(button.dataset.cfgPreset));
}
for (const button of els.alignButtons) {
  button.addEventListener("click", () => {
    markCustomPreset();
    setAlign(button.dataset.cfgAlign);
    update();
  });
}

els.copy?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(buildUrl(true));
    toast("overlay url copied");
  } catch {
    toast("clipboard unavailable", "err");
  }
});

applyPreset("broadcast", { silent: true });

function applyPreset(name, { silent = false } = {}) {
  const next = PRESETS[name] ? name : "broadcast";
  const config = PRESETS[next];
  preset = next;
  if (els.max) els.max.value = String(config.max);
  if (els.fade) els.fade.value = String(config.fade);
  if (els.scale) els.scale.value = String(config.scale);
  mode = config.mode || "feed";
  approvedOnly = Boolean(config.approvedOnly);
  setAlign(config.align);
  for (const box of els.sources) {
    box.checked = config.sources.includes(box.dataset.cfgSource);
  }
  syncPresetButtons();
  update();
  if (!silent) toast(`${config.label} preset loaded`);
}

function markCustomPreset() {
  if (preset === "custom") return;
  preset = "custom";
  syncPresetButtons();
}

function syncPresetButtons() {
  for (const button of els.presets) {
    const active = button.dataset.cfgPreset === preset;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  if (els.presetOut) els.presetOut.textContent = preset;
}

function setAlign(value) {
  align = value === "bottom" ? "bottom" : "top";
  els.alignButtons.forEach((item) => {
    const active = item.dataset.cfgAlign === align;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
}

function update() {
  const max = els.max?.value || "6";
  const fade = Number(els.fade?.value || 0);
  const scale = Number(els.scale?.value || 1);

  if (els.maxOut) els.maxOut.textContent = max;
  if (els.fadeOut) els.fadeOut.textContent = fade === 0 ? "never" : `${fade}s`;
  if (els.scaleOut) els.scaleOut.textContent = `${scale.toFixed(1)}×`;

  const url = buildUrl(false);
  if (els.url) els.url.textContent = url;

  // Debounce iframe reloads while sliders drag.
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (els.preview) els.preview.src = url;
  }, 250);
}

function buildUrl(absolute) {
  const params = new URLSearchParams();
  const max = Number(els.max?.value || 6);
  const fade = Number(els.fade?.value || 0);
  const scale = Number(els.scale?.value || 1);
  const picked = els.sources.filter((box) => box.checked).map((box) => box.dataset.cfgSource);

  if (preset !== "custom") params.set("preset", preset);
  if (mode !== "feed") params.set("mode", mode);
  if (approvedOnly) params.set("approvedOnly", "1");
  if (max !== 6) params.set("max", String(max));
  if (fade > 0) params.set("fade", String(fade));
  if (scale !== 1) params.set("scale", scale.toFixed(1));
  if (align !== "top") params.set("align", align);
  if (picked.length > 0 && picked.length < els.sources.length) params.set("sources", picked.join(","));

  const query = params.toString();
  const path = `/overlay.html${query ? `?${query}` : ""}`;
  return absolute ? new URL(path, location.origin).href : path;
}

function toast(text, tone = "ok") {
  if (!els.toastRoot) return;
  const node = document.createElement("div");
  node.className = "toast";
  node.dataset.tone = tone;
  node.textContent = text;
  els.toastRoot.append(node);
  setTimeout(() => node.classList.add("out"), 2200);
  setTimeout(() => node.remove(), 2600);
}
