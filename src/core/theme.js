// THEME

let currentTheme = localStorage.getItem("theme") || "dark";

export function applyTheme() {
  document.body.setAttribute("data-theme", currentTheme);
}

export function getTheme() {
  return currentTheme;
}

export function setTheme(theme) {
  currentTheme = theme;
  localStorage.setItem("theme", theme);
  applyTheme();
}