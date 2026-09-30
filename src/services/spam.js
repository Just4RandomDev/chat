// SPAM
// Progressive escalation with time-based decay.
// One tier per user, shared across rooms and DMs.

import { SPAM_WINDOW_MS, SPAM_TIERS, SPAM_DECAY_MS, SPAM_CLEAN_MS } from "../core/constants.js";
import { state } from "../core/state.js";

// uid -> { tier, flags: [timestamps], lastFlagAt, muteUntil }
const trackers = new Map();

let countdownInterval = null;

function getTracker(uid) {
  let t = trackers.get(uid);
  if (!t) {
    t = { tier: 0, flags: [], lastFlagAt: 0, muteUntil: 0 };
    trackers.set(uid, t);
  }
  return t;
}

function refreshTracker(tracker, now, uid) {
  tracker.flags = tracker.flags.filter(ts => now - ts < SPAM_WINDOW_MS);

  if (tracker.tier > 0 && tracker.lastFlagAt > 0) {
    const idleFor = now - tracker.lastFlagAt;
    if (idleFor >= SPAM_DECAY_MS) {
      const stepsDown = Math.floor(idleFor / SPAM_DECAY_MS);
      tracker.tier = Math.max(0, tracker.tier - stepsDown);
      tracker.lastFlagAt = tracker.lastFlagAt + stepsDown * SPAM_DECAY_MS;
    }
  }

  if (tracker.tier === 0 && tracker.flags.length === 0 && tracker.lastFlagAt > 0) {
    if (now - tracker.lastFlagAt > SPAM_CLEAN_MS) {
      trackers.delete(uid);
    }
  }
}

export function spamCheck() {
  const uid = state.me?.uid;
  if (!uid) return { ok: true };

  const now = Date.now();
  const tracker = getTracker(uid);
  refreshTracker(tracker, now, uid);

  if (tracker.muteUntil > now) {
    return {
      ok: false,
      muteMs: tracker.muteUntil - now,
      remainingMs: tracker.muteUntil - now,
      message: null
    };
  }

  tracker.flags.push(now);

  const count = tracker.flags.length;

  let newTier = 0;
  for (let i = 0; i < SPAM_TIERS.length; i++) {
    if (count >= SPAM_TIERS[i].threshold) newTier = i + 1;
  }

  if (newTier > tracker.tier) {
    tracker.tier = newTier;
    tracker.lastFlagAt = now;

    const tierConfig = SPAM_TIERS[newTier - 1];
    if (tierConfig.muteMs > 0) {
      tracker.muteUntil = now + tierConfig.muteMs;
      startCountdown();
    }

    return {
      ok: false,
      muteMs: tierConfig.muteMs,
      remainingMs: tierConfig.muteMs,
      message: tierConfig.label
    };
  }

  tracker.lastFlagAt = now;
  return { ok: true };
}

function startCountdown() {
  if (countdownInterval) return;

  const input = document.getElementById("messageInput");
  const dmInput = document.getElementById("dmInput");
  const sendBtn = document.getElementById("sendBtn");
  const dmSendBtn = document.getElementById("dmSendBtn");

  const originalPlaceholder = input?.placeholder || "";
  const originalDmPlaceholder = dmInput?.placeholder || "";

  countdownInterval = setInterval(() => {
    const uid = state.me?.uid;
    if (!uid) { stopCountdown(); return; }
    const tracker = trackers.get(uid);
    if (!tracker) { stopCountdown(); return; }

    const now = Date.now();
    const remaining = tracker.muteUntil - now;

    if (remaining <= 0) {
      if (input) {
        input.disabled = false;
        input.placeholder = originalPlaceholder;
      }
      if (dmInput) {
        dmInput.disabled = false;
        dmInput.placeholder = originalDmPlaceholder;
      }
      if (sendBtn) sendBtn.disabled = false;
      if (dmSendBtn) dmSendBtn.disabled = false;
      stopCountdown();
      return;
    }

    const seconds = Math.ceil(remaining / 1000);
    const text = `Muted for ${seconds}s…`;

    if (input) {
      input.disabled = true;
      input.placeholder = text;
    }
    if (dmInput) {
      dmInput.disabled = true;
      dmInput.placeholder = text;
    }
    if (sendBtn) sendBtn.disabled = true;
    if (dmSendBtn) dmSendBtn.disabled = true;
  }, 250);
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

export function resetSpamState() {
  trackers.clear();
  stopCountdown();
}
