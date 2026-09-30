// GLOBAL STATE
// Single source of truth for mutable app state.

export const state = {
  me: null,
  admins: [],

  // Room
  roomCode: null,
  roomMeta: null,
  roomRef: null,
  queryRef: null,
  presenceRef: null,
  presenceOff: null,
  seenOff: null,
  kickedOff: null,
  seenData: {},
  presenceData: {},
  enteringRoom: false,

  // Message grouping
  lastGroupEl: null,
  lastGroupUid: null,
  lastGroupTime: 0,

  // Reply
  reply: null,
  dmReply: null,

  // Files
  pendingFile: null,
  dmPendingFile: null,

  // DM
  activeDmUid: null,

  // Notifications
  notifOff: null,
  notifications: [],
  unread: 0,

  // Lobby
  lobbyOff: null,
  lobbyToken: 0,
  roomCards: new Map(),

  // Timers
  sweepId: null,
  cleanId: null,
  heartbeatId: null,

  // Mentions
  mentionTarget: null,
  mentionList: [],
  mentionIndex: -1,
  mentionStart: -1,

  // Moderation
  viewedUid: null,
  reactionTarget: null,
  moreTarget: null,

  // Spam
  spamTracker: [],

  // Reaction listeners (to clean up on room leave)
  reactionListeners: [],

  // User cache invalidation
  usernameIndex: null
};

export function resetRoomState() {
  state.roomCode = null;
  state.roomMeta = null;
  state.roomRef = null;
  state.queryRef = null;
  state.presenceRef = null;
  state.presenceOff = null;
  state.seenOff = null;
  state.kickedOff = null;
  state.seenData = {};
  state.presenceData = {};
  state.lastGroupEl = null;
  state.lastGroupUid = null;
  state.lastGroupTime = 0;
  state.reply = null;
  state.pendingFile = null;
  state.mentionTarget = null;
  state.mentionList = [];
  state.mentionIndex = -1;
  state.mentionStart = -1;
  state.reactionListeners = [];
  state.usernameIndex = null;
}