// APPEARANCE
// Color presets, UI color overrides, custom CSS/HTML/JS.

import { $, on, esc } from "../core/dom.js";
import { COLOR_VARS, PRESETS } from "../core/constants.js";
import { generateVarsTemplate } from "../core/helpers.js";
import { t } from "../core/i18n.js";
import { getTheme, setTheme } from "../core/theme.js";

let appearance = JSON.parse(localStorage.getItem("appearance") || "{}");
let customCss = localStorage.getItem("customCss") || "";
let customHtml = localStorage.getItem("customHtml") || "";
let customJs = localStorage.getItem("customJs") || "";

const saveAppearance = () => localStorage.setItem("appearance", JSON.stringify(appearance));
const saveCss = () => localStorage.setItem("customCss", customCss);
const saveHtml = () => localStorage.setItem("customHtml", customHtml);
const saveJs = () => localStorage.setItem("customJs", customJs);

export function applyAppearance() {
  const lines = [":root {"];
  for (const [k, v] of Object.entries(appearance)) {
    if (v) lines.push(`  --${k}: ${v};`);
  }
  lines.push("}");
  const combined = lines.join("\n") + "\n\n" + customCss;

  let tag = document.getElementById("custom-css");
  if (!tag) {
    tag = document.createElement("style");
    tag.id = "custom-css";
    document.head.appendChild(tag);
  }
  tag.textContent = combined;

  applyCustomHtml();
  applyCustomJs();
}

function applyCustomHtml() {
  const mount = document.getElementById("customHtmlMount");
  if (mount) mount.innerHTML = customHtml;
}

function applyCustomJs() {
  if (!customJs.trim()) return;
  try {
    new Function(customJs)();
  } catch (e) {
    console.warn("[custom js]", e);
  }
}

export function buildPresetGrid() {
  const grid = $("presetGrid");
  if (!grid) return;
  grid.innerHTML = "";

  for (const [name, colors] of Object.entries(PRESETS)) {
    const btn = document.createElement("button");
    btn.className = "preset-btn";
    const swatches = ["bg", "accent", "name", "text"]
      .map(k => `<span class="preset-swatch" style="background:${colors[k]}"></span>`)
      .join("");
    btn.innerHTML = `<div class="preset-swatches">${swatches}</div><div class="preset-name">${esc(name)}</div>`;

    btn.addEventListener("click", () => {
      appearance = { ...colors };
      saveAppearance();
      applyAppearance();
      buildColorGrid();
      window.__illoToast?.("Preset applied: " + name);
    });

    grid.appendChild(btn);
  }
}

export function buildColorGrid() {
  const grid = $("colorGrid");
  if (!grid) return;
  grid.innerHTML = "";

  for (const { key, label } of COLOR_VARS) {
    const current = appearance[key] || "";
    const fallback = getComputedStyle(document.documentElement)
      .getPropertyValue(`--${key}`).trim() || "#000000";
    const val = current || fallback;

    const row = document.createElement("div");
    row.className = "color-row";
    row.innerHTML = `<label>${esc(label)}</label>
      <input type="color" value="${val}">
      <input type="text" value="${val}">`;

    const picker = row.querySelector('input[type="color"]');
    const hex = row.querySelector('input[type="text"]');

    picker.addEventListener("input", () => {
      const v = picker.value;
      hex.value = v;
      appearance[key] = v;
      saveAppearance();
      applyAppearance();
    });

    hex.addEventListener("change", () => {
      let v = hex.value.trim();
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        picker.value = v;
        appearance[key] = v;
        saveAppearance();
        applyAppearance();
      } else {
        hex.value = appearance[key] || fallback;
      }
    });

    grid.appendChild(row);
  }
}

export function initAppearance() {
  // Theme
  on($("themeSelect"), "change", () => {
    setTheme($("themeSelect").value);
    appearance = {};
    saveAppearance();
    applyAppearance();
    buildColorGrid();
  });

  // Advanced CSS modal
  on($("openAdvancedCssBtn"), "click", () => {
    $("customCssInput").value = customCss;
    $("customHtmlInput").value = customHtml;
    $("customJsInput").value = customJs;

    document.querySelectorAll("[data-custom-tab]").forEach(x => x.classList.remove("active"));
    const cssTab = document.querySelector('[data-custom-tab="css"]');
    if (cssTab) cssTab.classList.add("active");

    $("customPaneCss")?.classList.remove("hidden");
    $("customPaneHtml")?.classList.add("hidden");
    $("customPaneJs")?.classList.add("hidden");
    $("advancedCssModal")?.classList.remove("hidden");
  });

  on($("insertVarsBtn"), "click", () => {
    const template = generateVarsTemplate(appearance, k =>
      getComputedStyle(document.documentElement).getPropertyValue(k)
    );
    const cur = $("customCssInput").value;
    $("customCssInput").value = cur ? cur + "\n\n" + template : template;
  });

  on($("saveCustomCssBtn"), "click", () => {
    customCss = $("customCssInput").value;
    customHtml = $("customHtmlInput").value;
    customJs = $("customJsInput").value;
    saveCss();
    saveHtml();
    saveJs();
    applyAppearance();
    $("advancedCssModal").classList.add("hidden");
    window.__illoToast?.(t("save"));
  });

  on($("cancelCustomCssBtn"), "click", () => $("advancedCssModal").classList.add("hidden"));

  on($("clearCustomCssBtn"), "click", () => {
    $("customCssInput").value = "";
    $("customHtmlInput").value = "";
    $("customJsInput").value = "";
  });

  on($("resetAppearanceBtn"), "click", () => {
    appearance = {};
    customCss = "";
    customHtml = "";
    customJs = "";
    saveAppearance();
    saveCss();
    saveHtml();
    saveJs();
    applyAppearance();
    buildColorGrid();
    window.__illoToast?.(t("appearanceReset"));
  });

  // Custom tabs
  document.querySelectorAll("[data-custom-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-custom-tab]").forEach(x => x.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.customTab;
      $("customPaneCss")?.classList.toggle("hidden", target !== "css");
      $("customPaneHtml")?.classList.toggle("hidden", target !== "html");
      $("customPaneJs")?.classList.toggle("hidden", target !== "js");
    });
  });
}

export function getAppearance() {
  return { appearance, customCss, customHtml, customJs };
}