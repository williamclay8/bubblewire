const els = {
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
let previewTimer = null;

for (const input of [els.max, els.fade, els.scale]) {
  input?.addEventListener("input", update);
}
for (const box of els.sources) {
  box.addEventListener("change", update);
}
for (const button of els.alignButtons) {
  button.addEventListener("click", () => {
    align = button.dataset.cfgAlign;
    els.alignButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
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

update();

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
