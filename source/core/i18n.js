// I18N

import { loadJson } from "./helpers.js";

let translations = {};
let currentLang = localStorage.getItem("lang") || "en";

export async function loadLanguages() {
  const codes = ["en", "es", "fr", "ru"];
  const entries = await Promise.all(
    codes.map(async c => {
      try {
        return [c, await loadJson(`data/languages/${c}.json`)];
      } catch {
        return [c, {}];
      }
    })
  );
  translations = Object.fromEntries(entries);
}

export function t(key) {
  return translations[currentLang]?.[key]
    ?? translations.en?.[key]
    ?? key;
}

export function applyTranslations() {
  document.querySelectorAll("[data-i18n]")
    .forEach(el => { el.textContent = t(el.getAttribute("data-i18n")); });

  document.querySelectorAll("[data-i18n-ph]")
    .forEach(el => { el.placeholder = t(el.getAttribute("data-i18n-ph")); });
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("lang", lang);
  applyTranslations();
}