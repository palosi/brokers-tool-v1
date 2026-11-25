window.BT = window.BT || {};

// The board data and every change to it. No DOM access; storage is passed in by init().
BT.state = (function () {
  const C = BT.config;
  const STORAGE_KEY = 'brokers-tool-v1-archive-board';
  const DEMO_KEY = 'brokers-tool-demo';
  const UNDO_LIMIT = 200;
  const FACTOR_KINDS = C.FACTOR_KINDS.map(function (k) { return k.id; });
  const HORIZON_IDS = C.HORIZONS.map(function (h) { return h.id; });
  const MIN_R = C.FACTOR_MIN_R, MAX_R = C.FACTOR_MAX_R, EDGE_R = C.SURROUNDINGS_RADIUS;
  const ASPIRATION_KEYS = C.ASPIRATION_QUESTIONS.map(function (q) { return q.id; });
  const api = {};

  let board = emptyBoard();
  let pending = null;     // snapshot of the board taken by begin(); non-null while a transaction is open
  let undoStack = [];
  let redoStack = [];
  let listeners = [];
  let storage = null;
  let storageOk = false;
  let seq = 0;
  let ownBoard = null;    // the broker's own board, kept aside while the demo board is shown

  function emptyBoard() {
    const aspiration = {};
    ASPIRATION_KEYS.forEach(function (k) { aspiration[k] = ''; });
    return { version: 1, aspiration: aspiration, items: [], connections: [] };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function save() {
    if (!storage || ownBoard) return;     // the demo board is never saved over the broker's own
    try { storage.setItem(STORAGE_KEY, JSON.stringify(board)); storageOk = true; }
    catch (e) { storageOk = false; }
  }

  function notify() {
    save();
    listeners.slice().forEach(function (fn) { fn(); });
  }

  // The live board. Treat it as read-only; change it only through this module.
  api.getBoard = function () { return board; };
  api.subscribe = function (fn) { listeners.push(fn); };

  // Back to a blank, unsaved state with no listeners. Used by the tests.
  api.reset = function () {
    board = emptyBoard(); pending = null; undoStack = []; redoStack = [];
    listeners = []; storage = null; storageOk = false; seq = 0; ownBoard = null;
  };

  // ---- transactions: everything between begin() and commit() is one undo step ----

  // Returns true if this call opened the transaction, false if one was already open.
  api.begin = function () {
    if (pending) return false;
    pending = clone(board);
    return true;
  };

  api.commit = function () {
    if (!pending) return;
    const before = pending;
    pending = null;
    if (JSON.stringify(before) !== JSON.stringify(board)) {
      undoStack.push(before);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      redoStack = [];
    }
    notify();
  };

  // Throws away everything done since begin().
  api.cancel = function () {
    if (!pending) return;
    board = pending;
    pending = null;
    notify();
  };

  api.inTransaction = function () { return pending !== null; };

  // Runs one change. On its own it is one undo step; inside a transaction it joins that step.
  function mutate(fn) {
    const own = api.begin();
    const result = fn();
    if (own) api.commit(); else notify();
    return result;
  }

  // ---- geometry: realm of influence ----

  api.category = function (kind) {
    return kind === 'note' ? 'note' : kind === 'action' ? 'action' : 'factor';
  };

  // The nearest allowed width for a card. Anything unreadable gives the standard width.
  api.clampWidth = function (w) {
    if (typeof w !== 'number' || !isFinite(w)) return C.ITEM_WIDTH;
    return Math.round(Math.min(C.ITEM_MAX_WIDTH, Math.max(C.ITEM_MIN_WIDTH, w)));
  };

  // The nearest allowed position for a factor. Its centre may go as far out as the outer circle itself,
  // so the card can hang over the edge, and as far in as the card touching the Aim circle.
  api.clampFactor = function (x, y) {
    let d = Math.hypot(x, y);
    if (d >= MIN_R - 1e-6 && d <= EDGE_R + 1e-6) return { x: x, y: y };
    if (d === 0) { x = 0; y = -1; d = 1; }
    const r = Math.min(EDGE_R, Math.max(MIN_R, d));
    return { x: x / d * r, y: y / d * r };
  };

  // 0 (easy to influence, at the Aim edge) to 100 (hard to influence, at the Surroundings edge).
  api.scaleFromPos = function (x, y) {
    const d = Math.min(MAX_R, Math.max(MIN_R, Math.hypot(x, y)));
    return Math.round((d - MIN_R) / (MAX_R - MIN_R) * 100);
  };

  // The position at scale `value`, in the same direction from the aim as (x, y).
  api.posFromScale = function (x, y, value) {
    const v = Math.min(100, Math.max(0, value));
    const r = MIN_R + (MAX_R - MIN_R) * v / 100;
    let d = Math.hypot(x, y);
    if (d === 0) { x = 0; y = -1; d = 1; }
    return { x: x / d * r, y: y / d * r };
  };

  // A spot halfway between the Aim edge and the Surroundings edge with no item on it.
  api.freeFactorSpot = function () {
    const r = (MIN_R + MAX_R) / 2;
    let p = null;
    for (let i = 0; i < 24; i++) {
      const a = -Math.PI / 2 + i * 2.399963;   // step round by the golden angle, starting at the top
      p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      const q = p;
      const taken = board.items.some(function (it) { return Math.hypot(it.x - q.x, it.y - q.y) < C.ITEM_WIDTH; });
      if (!taken) return p;
    }
    return p;
  };

  // A spot for a new factor that explains the factor `id`: at the same distance from the aim, beside it,
  // on whichever side is free. Tries further round the circle if both neighbours are taken.
  // firstSide is 1 or -1: which side of the factor to try first.
  api.whySpot = function (id, firstSide) {
    const src = findItem(id);
    if (!src) return api.freeFactorSpot();
    const r = Math.min(EDGE_R, Math.max(MIN_R, Math.hypot(src.x, src.y)));
    const a0 = Math.atan2(src.y, src.x);
    const step = (C.ITEM_WIDTH + 50) / r;     // one card and a gap, measured along the circle
    let first = null;
    for (let i = 1; i <= 12; i++) {
      for (let n = 0; n < 2; n++) {
        const side = (firstSide === -1 ? -1 : 1) * (n === 0 ? 1 : -1);
        const a = a0 + side * i * step;
        const p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
        if (!first) first = p;
        const taken = board.items.some(function (it) { return Math.hypot(it.x - p.x, it.y - p.y) < C.ITEM_WIDTH; });
        if (!taken) return p;
      }
    }
    return first;
  };

  // ---- items ----

  function newId(prefix) {
    let id;
    do { seq += 1; id = prefix + seq; }
    while (board.items.some(function (i) { return i.id === id; }) ||
           board.connections.some(function (c) { return c.id === id; }));
    return id;
  }

  function findItem(id) {
    for (let i = 0; i < board.items.length; i++) if (board.items[i].id === id) return board.items[i];
    return null;
  }
  api.getItem = findItem;

  // kind: 'factor' (kind not chosen yet), 'opportunity', 'barrier', 'influence', 'action' or 'note'.
  api.addItem = function (kind, x, y) {
    const known = kind === 'factor' || kind === 'action' || kind === 'note' || FACTOR_KINDS.indexOf(kind) >= 0;
    if (!known) throw new Error('Unknown kind: ' + kind);
    return mutate(function () {
      const item = { id: newId('i'), kind: kind, text: '', x: x, y: y };
      if (api.category(kind) === 'factor') {
        const p = api.clampFactor(x, y);
        item.x = p.x; item.y = p.y;
      }
      board.items.push(item);
      return item.id;
    });
  };

  // patch may hold text, kind, type, horizon, x, y. Returns false if the item is missing or the kind change is not allowed.
  api.updateItem = function (id, patch) {
    return mutate(function () {
      const item = findItem(id);
      if (!item) return false;
      const cat = api.category(item.kind);
      if (patch.kind !== undefined && patch.kind !== item.kind) {
        if (cat !== 'factor' || FACTOR_KINDS.indexOf(patch.kind) < 0) return false;
        item.kind = patch.kind;
      }
      if (patch.text !== undefined) item.text = String(patch.text);
      if (cat === 'factor' && patch.type !== undefined) {
        const type = String(patch.type).trim();
        if (type) item.type = type; else delete item.type;
      }
      if (cat === 'factor' && patch.notes !== undefined) {
        const notes = String(patch.notes);
        if (notes.trim()) item.notes = notes; else delete item.notes;
      }
      if (cat === 'action' && patch.horizon !== undefined) {
        if (HORIZON_IDS.indexOf(patch.horizon) >= 0) item.horizon = patch.horizon; else delete item.horizon;
      }
      if (patch.w !== undefined) {
        const w = api.clampWidth(patch.w);
        if (w === C.ITEM_WIDTH) delete item.w; else item.w = w;
      }
      if (patch.x !== undefined || patch.y !== undefined) {
        let x = patch.x !== undefined ? patch.x : item.x;
        let y = patch.y !== undefined ? patch.y : item.y;
        if (cat === 'factor') { const p = api.clampFactor(x, y); x = p.x; y = p.y; }
        item.x = x; item.y = y;
      }
      return true;
    });
  };

  // Removes the item and every connection attached to it.
  api.removeItem = function (id) {
    return mutate(function () {
      const before = board.items.length;
      board.items = board.items.filter(function (i) { return i.id !== id; });
      board.connections = board.connections.filter(function (c) { return c.from !== id && c.to !== id; });
      return board.items.length < before;
    });
  };

  // ---- connections ----

  // Returns the new connection's id, or null if the two items cannot be connected.
  // Which ends of a connection have an arrowhead: 'to', 'from' or 'both'. A plain line has none.
  const ARROWS = ['to', 'from', 'both'];

  // Joins two items with a plain line, or with arrowheads if arrow is 'to', 'from' or 'both'.
  api.addConnection = function (from, to, arrow) {
    if (from === to || !findItem(from) || !findItem(to)) return null;
    const exists = board.connections.some(function (c) {
      return (c.from === from && c.to === to) || (c.from === to && c.to === from);
    });
    if (exists) return null;
    return mutate(function () {
      const c = { id: newId('c'), from: from, to: to };
      if (ARROWS.indexOf(arrow) >= 0) c.arrow = arrow;
      board.connections.push(c);
      return c.id;
    });
  };

  // Sets a connection's arrowheads: 'to' (pointing at the item it was drawn to), 'from' (pointing at the
  // item it was drawn from), 'both', or '' for a plain line. Returns false if nothing changed.
  api.setConnectionArrow = function (id, arrow) {
    const c = board.connections.filter(function (x) { return x.id === id; })[0];
    const next = ARROWS.indexOf(arrow) >= 0 ? arrow : '';
    if (!c || (c.arrow || '') === next) return false;
    return mutate(function () {
      if (next) c.arrow = next; else delete c.arrow;
      return true;
    });
  };

  api.removeConnection = function (id) {
    return mutate(function () {
      const before = board.connections.length;
      board.connections = board.connections.filter(function (c) { return c.id !== id; });
      return board.connections.length < before;
    });
  };

  // ---- aspiration answers ----

  // key: the id of one of the aspiration questions in config.js.
  api.setAspiration = function (key, value) {
    if (!Object.prototype.hasOwnProperty.call(board.aspiration, key)) return false;
    return mutate(function () {
      board.aspiration[key] = String(value);
      return true;
    });
  };

  // ---- undo and redo ----

  api.canUndo = function () { return undoStack.length > 0; };
  api.canRedo = function () { return redoStack.length > 0; };

  api.undo = function () {
    if (pending) api.commit();
    if (!undoStack.length) return false;
    redoStack.push(board);
    board = undoStack.pop();
    notify();
    return true;
  };

  api.redo = function () {
    if (pending) api.commit();
    if (!redoStack.length) return false;
    undoStack.push(board);
    board = redoStack.pop();
    notify();
    return true;
  };

  // ---- validation, loading and saving ----

  const FILE_KINDS = FACTOR_KINDS.concat(['action', 'note']);

  // Returns null if obj is a valid board file, otherwise a message for the user.
  api.validate = function (obj) {
    const bad = function (why) { return 'This file is not a brokers tool board (' + why + ').'; };
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return bad('unexpected contents');
    if (obj.version !== 1) return bad('unknown version');
    const asp = obj.aspiration;
    if (!asp || typeof asp !== 'object') return bad('no aspiration answers');
    for (let i = 0; i < ASPIRATION_KEYS.length; i++) {
      if (typeof asp[ASPIRATION_KEYS[i]] !== 'string') return bad('aspiration answers are incomplete');
    }
    if (!Array.isArray(obj.items) || !Array.isArray(obj.connections)) return bad('no item or connection list');

    const itemIds = {};
    for (let i = 0; i < obj.items.length; i++) {
      const it = obj.items[i];
      if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !it.id) return bad('an item has no id');
      if (itemIds[it.id]) return bad('two items share an id');
      itemIds[it.id] = true;
      if (FILE_KINDS.indexOf(it.kind) < 0) return bad('an item has an unknown kind');
      if (typeof it.text !== 'string') return bad('an item has no text');
      if (typeof it.x !== 'number' || typeof it.y !== 'number' || !isFinite(it.x) || !isFinite(it.y)) return bad('an item has no position');
      if (it.type !== undefined && typeof it.type !== 'string') return bad('an item has an unreadable type');
      if (it.w !== undefined && (typeof it.w !== 'number' || !isFinite(it.w))) return bad('an item has an unreadable width');
      if (it.notes !== undefined && typeof it.notes !== 'string') return bad('an item has unreadable notes');
      if (it.horizon !== undefined && HORIZON_IDS.indexOf(it.horizon) < 0) return bad('an action has an unknown time horizon');
    }

    const connIds = {}, pairs = {};
    for (let i = 0; i < obj.connections.length; i++) {
      const c = obj.connections[i];
      if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id) return bad('a connection has no id');
      if (connIds[c.id] || itemIds[c.id]) return bad('two things share an id');
      connIds[c.id] = true;
      if (!itemIds[c.from] || !itemIds[c.to]) return bad('a connection points at a missing item');
      if (c.from === c.to) return bad('an item is connected to itself');
      if (c.arrow !== undefined && typeof c.arrow !== 'boolean' && ARROWS.indexOf(c.arrow) < 0) return bad('a connection has an unreadable arrow');
      const pair = [c.from, c.to].sort().join('|');
      if (pairs[pair]) return bad('two items are connected twice');
      pairs[pair] = true;
    }
    return null;
  };

  // A clean copy of a valid board file: known properties only, factors inside the circle.
  function normalise(obj) {
    const out = emptyBoard();
    ASPIRATION_KEYS.forEach(function (k) { out.aspiration[k] = obj.aspiration[k]; });
    obj.items.forEach(function (it) {
      const cat = api.category(it.kind);
      const item = { id: it.id, kind: it.kind, text: it.text, x: it.x, y: it.y };
      if (cat === 'factor') {
        const p = api.clampFactor(it.x, it.y);
        item.x = p.x; item.y = p.y;
        if (it.type && it.type.trim()) item.type = it.type.trim();
        if (it.notes && it.notes.trim()) item.notes = it.notes;
      }
      if (cat === 'action' && it.horizon) item.horizon = it.horizon;
      if (it.w !== undefined && api.clampWidth(it.w) !== C.ITEM_WIDTH) item.w = api.clampWidth(it.w);
      out.items.push(item);
    });
    obj.connections.forEach(function (c) {
      const conn = { id: c.id, from: c.from, to: c.to };
      // An earlier version saved a one-way arrow as true.
      if (c.arrow === true) conn.arrow = 'to'; else if (c.arrow) conn.arrow = c.arrow;
      out.connections.push(conn);
    });
    return out;
  }

  // Boards saved before the aspiration questions changed used q3 and q4 for two of the answers.
  // Returns obj, updated in place where needed.
  api.upgrade = function (obj) {
    const asp = obj && typeof obj === 'object' ? obj.aspiration : null;
    if (asp && typeof asp === 'object') {
      if (asp.change === undefined && typeof asp.q3 === 'string') asp.change = asp.q3;
      if (asp.challenge === undefined && typeof asp.q4 === 'string') asp.challenge = asp.q4;
    }
    return obj;
  };

  // Replaces the board with a board file, as one undo step. Returns null, or the validation message.
  api.loadBoard = function (obj) {
    api.upgrade(obj);
    const err = api.validate(obj);
    if (err) return err;
    mutate(function () { board = normalise(obj); });
    return null;
  };

  api.newBoard = function () {
    mutate(function () { board = emptyBoard(); });
  };

  // The board as the text of a board file.
  // ---- demo ----

  api.inDemo = function () { return ownBoard !== null; };

  // Shows a demo board in place of the broker's own, which is kept aside untouched. Changes made to the
  // demo are not saved. Returns an error message if obj is not a valid board, otherwise null.
  api.showDemo = function (obj) {
    obj = clone(obj);
    api.upgrade(obj);
    const err = api.validate(obj);
    if (err) return err;
    if (pending) api.cancel();
    if (!ownBoard) ownBoard = board;
    board = normalise(obj);
    undoStack = []; redoStack = [];
    try { if (storage) storage.setItem(DEMO_KEY, '1'); } catch (e) { /* the demo still shows */ }
    notify();
    return null;
  };

  // Goes back to the broker's own board, as it was when the demo was shown.
  api.leaveDemo = function () {
    if (!ownBoard) return;
    if (pending) api.cancel();
    board = ownBoard;
    ownBoard = null;
    undoStack = []; redoStack = [];
    try { if (storage) storage.removeItem(DEMO_KEY); } catch (e) { /* nothing to remove */ }
    notify();
  };

  // True if the demo was showing when the page was last closed or reloaded.
  api.demoWasOn = function () {
    try { return !!storage && storage.getItem(DEMO_KEY) === '1'; } catch (e) { return false; }
  };

  api.serialise = function () { return JSON.stringify(board, null, 2); };

  api.storageAvailable = function () { return storageOk; };

  // Call once at start-up with window.localStorage (or null). Restores the saved board if there is one.
  api.init = function (store) {
    storage = null; storageOk = false;
    try {
      store.setItem('brokers-tool-probe', '1');
      store.removeItem('brokers-tool-probe');
    } catch (e) { return; }
    storage = store; storageOk = true;

    let obj;
    try { obj = JSON.parse(storage.getItem(STORAGE_KEY)); } catch (e) { return; }
    if (!obj || !Array.isArray(obj.items) || !Array.isArray(obj.connections)) return;
    api.upgrade(obj);
    // The page may have been closed while a new factor's kind was still unchosen.
    const dropped = {};
    obj.items = obj.items.filter(function (it) {
      if (it && it.kind === 'factor') { dropped[it.id] = true; return false; }
      return true;
    });
    obj.connections = obj.connections.filter(function (c) { return c && !dropped[c.from] && !dropped[c.to]; });
    if (api.validate(obj) === null) board = normalise(obj);
  };

  return api;
})();
