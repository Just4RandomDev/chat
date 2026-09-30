// CONSTANTS

export const PUBLIC_ROOM = "public";
export const BOT_UID = "system";

export const GROUP_MS = 5 * 60 * 1000;
export const EMPTY_TTL = 5 * 60 * 1000;
export const SWEEP_MS = 60 * 1000;
export const MSG_TTL_MS = 15 * 60 * 1000;
export const MSG_MAX = 100;
export const AUTO_CLEAN_MS = 60 * 1000;
export const PRESENCE_STALE_MS = 2 * 60 * 1000;
export const HEARTBEAT_MS = 30 * 1000;
export const SPAM_WINDOW_MS = 5000;
export const SPAM_MAX = 10;
export const STATUS_MAX = 150;
export const BANNER_MAX_BYTES = 400 * 1024;
export const PFP_MAX_BYTES = 400 * 1024;
export const FILE_MAX_BYTES = 1.5 * 1024 * 1024;

export const ICON_PATHS = {
  bell:      `M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z`,
  gear:      `M19.14 12.94a7.5 7.5 0 0 0 .06-.94 7.5 7.5 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.24-1.12.55-1.62.94L5.24 4.94a.5.5 0 0 0-.6.22L2.72 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0-.06.94c0 .32.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.6.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96c.18.12.46.02.6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z`,
  paperclip: `M16.5 6.5v11a4.5 4.5 0 0 1-9 0V6a3 3 0 0 1 6 0v11.5a1.5 1.5 0 0 1-3 0V8h-2v9.5a3.5 3.5 0 0 0 7 0V6a5 5 0 0 0-10 0v11.5a6.5 6.5 0 0 0 13 0V6.5h-2z`,
  lock:      `M17 9V7a5 5 0 0 0-10 0v2a3 3 0 0 0-2 2.83V19a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-7.17A3 3 0 0 0 17 9zM9 7a3 3 0 0 1 6 0v2H9V7z`,
  globe:     `M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.93 9h-3.44a15.6 15.6 0 0 0-1.2-5.44A8.02 8.02 0 0 1 19.93 11zM12 4.06c.83 1.2 1.7 3.35 1.95 6.94h-3.9c.25-3.59 1.12-5.74 1.95-6.94zM4.07 13h3.44c.16 1.9.6 3.83 1.2 5.44A8.02 8.02 0 0 1 4.07 13zm3.44-2H4.07a8.02 8.02 0 0 1 4.64-5.44A15.6 15.6 0 0 0 7.51 11zM12 19.94c-.83-1.2-1.7-3.35-1.95-6.94h3.9c-.25 3.59-1.12 5.74-1.95 6.94zm2.49-1.5a15.6 15.6 0 0 0 1.2-5.44h3.44a8.02 8.02 0 0 1-4.64 5.44z`,
  crown:     `M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7z`,
  chat:      `M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z`,
  pencil:    `M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z`,
  image:     `M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z`,
  send:      `M2.01 21L23 12 2.01 3 2 10l15 2-15 2z`,
  reply:     `M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z`,
  trash:     `M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z`,
  more:      `M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z`,
  block:     `M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM5.7 7.1l9.2 9.2A8 8 0 0 1 5.7 7.1zm12.6 9.8L9.1 7.7a8 8 0 0 1 9.2 9.2z`,
  react:     `M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 0 1 6.93 4H16.5a2.5 2.5 0 0 0-2.45 2H12a2 2 0 0 0-2-2H6.07A8 8 0 0 1 12 4zm0 16a8 8 0 0 1-5.93-2.59A2.5 2.5 0 0 0 8.5 16H12a2 2 0 0 0 2 2h2.5a2.5 2.5 0 0 0 2.05-1.07A8 8 0 0 1 12 20zm8-8a8 8 0 0 1-.2 1.8h-3.3a4.5 4.5 0 0 0 0-3.6h3.3A8 8 0 0 1 20 12zM4 12c0-.62.07-1.22.2-1.8h3.3a4.5 4.5 0 0 0 0 3.6H4.2A8 8 0 0 1 4 12zm8-2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z`
};

export const COLOR_VARS = [
  { key: "bg",           label: "Background" },
  { key: "bg-app",       label: "App" },
  { key: "bg-panel",     label: "Panel" },
  { key: "bg-header",    label: "Header" },
  { key: "bg-input",     label: "Input" },
  { key: "border",       label: "Border" },
  { key: "text",         label: "Text" },
  { key: "text-dim",     label: "Dim Text" },
  { key: "text-bright",  label: "Bright Text" },
  { key: "accent",       label: "Accent" },
  { key: "accent-hover", label: "Accent Hover" },
  { key: "name",         label: "Other Name" },
  { key: "name-own",     label: "Own Name" },
  { key: "link",         label: "Link" },
  { key: "danger",       label: "Danger" },
  { key: "icon-color",   label: "Icon Color" }
];

export const PRESETS = {
  "Default Dark":  { bg:"#0e0e0e","bg-app":"#1a1a1a","bg-panel":"#161616","bg-header":"#241a1a","bg-input":"#0e0e0e",border:"#3a2a2a",text:"#d6a0a0","text-dim":"#b08080","text-bright":"#e8d0d0",accent:"#d94a4a","accent-hover":"#ff5a5a",name:"#6fc77f","name-own":"#9ac76f",link:"#6fa8ff",danger:"#ff5a5a","icon-color":"#d94a4a" },
  "Default Light": { bg:"#f5f5f5","bg-app":"#ffffff","bg-panel":"#efefef","bg-header":"#e8e0e0","bg-input":"#ffffff",border:"#d0c0c0",text:"#4a2020","text-dim":"#7a5a5a","text-bright":"#2a1010",accent:"#b83030","accent-hover":"#d94a4a",name:"#2a7a3a","name-own":"#4a8a2a",link:"#1a5ad0",danger:"#c02020","icon-color":"#b83030" },
  "Nord":          { bg:"#2e3440","bg-app":"#3b4252","bg-panel":"#2e3440","bg-header":"#434c5e","bg-input":"#2e3440",border:"#4c566a",text:"#d8dee9","text-dim":"#a0aec0","text-bright":"#eceff4",accent:"#88c0d0","accent-hover":"#8fbcbb",name:"#a3be8c","name-own":"#ebcb8b",link:"#81a1c1",danger:"#bf616a","icon-color":"#88c0d0" },
  "Solarized":     { bg:"#002b36","bg-app":"#073642","bg-panel":"#002b36","bg-header":"#073642","bg-input":"#002b36",border:"#586e75",text:"#93a1a1","text-dim":"#657b83","text-bright":"#eee8d5",accent:"#b58900","accent-hover":"#cb4b16",name:"#859900","name-own":"#2aa198",link:"#268bd2",danger:"#dc322f","icon-color":"#b58900" },
  "Terminal":      { bg:"#000000","bg-app":"#0a0a0a","bg-panel":"#050505","bg-header":"#001a00","bg-input":"#000000",border:"#003300",text:"#00ff41","text-dim":"#008f11","text-bright":"#7aff7a",accent:"#00ff41","accent-hover":"#7aff7a",name:"#00ff41","name-own":"#7aff7a",link:"#00bfff",danger:"#ff0055","icon-color":"#00ff41" },
  "Pink":          { bg:"#1a0a1a","bg-app":"#241224","bg-panel":"#1f0d1f","bg-header":"#3d1a3d","bg-input":"#1a0a1a",border:"#5a2a5a",text:"#ffc0f0","text-dim":"#c080b0","text-bright":"#ffe0f5",accent:"#ff69b4","accent-hover":"#ff85c8",name:"#ffb3d9","name-own":"#ffd9ec",link:"#ff66cc",danger:"#ff3366","icon-color":"#ff69b4" }
};

export const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
export const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
export const VID_EXT = /\.(mp4|webm|ogg|mov)(\?.*)?$/i;

export const MEDIA_HOSTS = new Set([
  "media.tenor.com",
  "c.tenor.com",
  "media.giphy.com",
  "i.giphy.com",
  "i.imgur.com",
  "cdn.discordapp.com",
  "media.discordapp.net"
]);