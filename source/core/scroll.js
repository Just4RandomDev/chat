// SCROLL HELPERS

export function isAtBottom(container) {
  if (!container) return true;
  return container.scrollTop + container.clientHeight >= container.scrollHeight - 80;
}

export function shouldStickToBottom(container) {
  if (!container) return true;
  const viewportBottom = container.scrollTop + container.clientHeight;
  const lines = container.querySelectorAll(".msg-line");
  if (!lines.length) return true;

  let below = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const node = lines[i];
    if (node.offsetTop + node.offsetHeight <= viewportBottom + 4) break;
    below++;
    if (below > 10) return false;
  }
  return below <= 10;
}