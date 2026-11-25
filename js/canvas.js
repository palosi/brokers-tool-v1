window.BT = window.BT || {};

// Draws the board in SVG and handles pan, zoom, select, drag and connect.
// It reads the board from BT.state and redraws everything after each change.
BT.canvas = (function () {
  const C = BT.config, S = BT.state;
  const NS = 'http://www.w3.org/2000/svg';
  const PAD = 18, LINE_H = 19, LABEL_H = 22, TEXT_SIZE = 13;
  const LABEL_SIZE = 9, LABEL_SPACING = 1.5, TAG_SIZE = 10;
  const NOTE_SIZE = 11, NOTE_LINE_H = 16;
  const WHY_SIZE = 11, ARROW_GAP = 5;     // the gap keeps an arrowhead clear of a zig-zag outline

  // handlers are set by ui.js: onEditItem(id), onEditAim(), onAsk({ id, mode }), onBackgroundDoubleClick({x, y}),
  // onViewChange(), onSelectionChange()
  const api = { handlers: {} };

  let svg, viewport, measureCtx;
  const layers = {};
  let style = {};
  let view = { x: 0, y: 0, k: 1 };      // screen = board * k + (x, y)
  let selection = null;                 // { type: 'item' | 'connection', id }
  let sizes = {};                       // item id -> { w, h } in board units
  let gesture = null;                   // the pointer gesture in progress
  let tempLine = null;                  // the line shown while dragging out a connection
  let lastClick = null;
  let pressCount = 0;                   // every pointer press anywhere on the page

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function call(name, arg) {
    if (typeof api.handlers[name] === 'function') api.handlers[name](arg);
  }

  // Style values come from the CSS variables in styles.css and are written onto the SVG
  // elements as attributes, so an exported image looks the same as the board.
  function readStyle() {
    const cs = getComputedStyle(document.documentElement);
    const v = function (name) { return cs.getPropertyValue(name).trim(); };
    style = {
      ink: v('--ink'), muted: v('--muted'), paper: v('--paper'), font: v('--font'),
      bandNear: v('--band-near'), bandMid: v('--band-mid'), bandFar: v('--band-far'),
      typeOwn: { fill: v('--type-own'), line: v('--type-own-line') },
      types: C.TYPES.map(function (t, i) {
        return { fill: v('--type-' + (i + 1)), line: v('--type-' + (i + 1) + '-line') };
      }),
      line: parseFloat(v('--line')), heavy: parseFloat(v('--line-heavy'))
    };
  }

  // Splits text into lines no wider than maxWidth. Line breaks typed by the user are kept.
  function wrap(str, maxWidth, fontSize, italic) {
    measureCtx.font = (italic ? 'italic ' : '') + fontSize + 'px ' + style.font;
    const out = [];
    String(str).split('\n').forEach(function (para) {
      let line = '';
      para.split(' ').forEach(function (word) {
        const trial = line ? line + ' ' + word : word;
        if (line && measureCtx.measureText(trial).width > maxWidth) { out.push(line); line = word; }
        else line = trial;
      });
      out.push(line);
    });
    return out;
  }

  function text(parent, str, x, y, size, opts) {
    const t = el('text', {
      x: x, y: y, 'font-family': style.font, 'font-size': size,
      fill: opts.fill || style.ink, 'text-anchor': opts.anchor || 'start'
    }, parent);
    if (opts.weight) t.setAttribute('font-weight', opts.weight);
    if (opts.spacing) t.setAttribute('letter-spacing', opts.spacing);
    if (opts.italic) t.setAttribute('font-style', 'italic');
    t.textContent = str;
    return t;
  }

  // ---- drawing ----

  function renderStatic() {
    const g = layers.fixed;
    g.textContent = '';
    // Realm of influence: three bands that get lighter away from the aim, with the two ends
    // of the scale named at the top. The dotted line is the limit for factors.
    const R0 = C.AIM_RADIUS, R3 = C.SURROUNDINGS_RADIUS, step = (R3 - R0) / 3;
    [style.bandFar, style.bandMid, style.bandNear].forEach(function (fill, i) {
      el('circle', { cx: 0, cy: 0, r: R3 - step * i, fill: fill, stroke: 'none' }, g);
    });
    el('circle', {
      cx: 0, cy: 0, r: R3, fill: 'none', stroke: style.ink,
      'stroke-width': style.line, 'stroke-dasharray': '1 8', 'stroke-linecap': 'round'
    }, g);
    text(g, C.SCALE_LOW.toUpperCase(), 0, -(R0 + 24), 12, { anchor: 'middle', spacing: 2, fill: style.muted });
    text(g, C.SCALE_HIGH.toUpperCase(), 0, -(R3 - 36), 12, { anchor: 'middle', spacing: 2, fill: style.muted });

    const aim = el('g', { 'data-aim': '1', cursor: 'pointer' }, g);
    el('circle', { cx: 0, cy: 0, r: C.AIM_RADIUS, fill: style.paper, stroke: style.ink, 'stroke-width': style.line }, aim);

    // Only the heading and the aim itself (the answer to the first question) are shown on the board.
    // The questions and the other answers are in the aim editor.
    const answer = (S.getBoard().aspiration[C.ASPIRATION_QUESTIONS[0].id] || '').trim();
    const width = C.AIM_RADIUS * 1.15;
    const rows = [{ str: 'AIM', size: 16, h: answer ? 30 : 22, opts: { weight: 'bold', spacing: 1.5 } }];
    let lines = answer ? wrap(answer, width, 17) : [];
    if (lines.length > 4) { lines = lines.slice(0, 4); lines[3] += '\u2026'; }
    lines.forEach(function (ln) { rows.push({ str: ln, size: 17, h: 23, opts: {} }); });
    const total = rows.reduce(function (sum, r) { return sum + r.h; }, 0);
    let y = -total / 2;
    rows.forEach(function (r) {
      if (r.str) text(aim, r.str, 0, y + r.h * 0.75, r.size, Object.assign({ anchor: 'middle' }, r.opts));
      y += r.h;
    });
  }

  function horizonLabel(id) {
    for (let i = 0; i < C.HORIZONS.length; i++) if (C.HORIZONS[i].id === id) return C.HORIZONS[i].label;
    return '';
  }

  // A factor's colour shows its type: a very light fill and a vivid outline of the same colour for each
  // listed type, grey for a type the broker wrote, white with a dark outline for none.
  function typeColour(type) {
    if (!type) return { fill: style.paper, line: style.ink };
    for (let i = 0; i < C.TYPES.length; i++) if (C.TYPES[i].name === type) return style.types[i] || style.typeOwn;
    return style.typeOwn;
  }

  // A closed zig-zag outline around a w-by-h box, the teeth pointing outwards. Used for barriers.
  function zigzag(w, h) {
    const tooth = 5, amp = 3, pts = [];
    const side = function (x0, y0, x1, y1, nx, ny) {
      const len = Math.abs(x1 - x0) + Math.abs(y1 - y0);
      const n = Math.max(2, 2 * Math.round(len / (2 * tooth)));
      for (let i = 0; i < n; i++) {
        const t = i / n, out = i % 2 ? amp : 0;
        pts.push((x0 + (x1 - x0) * t + nx * out).toFixed(1) + ',' + (y0 + (y1 - y0) * t + ny * out).toFixed(1));
      }
    };
    side(0, 0, w, 0, 0, -1); side(w, 0, w, h, 1, 0); side(w, h, 0, h, 0, 1); side(0, h, 0, 0, -1, 0);
    return 'M' + pts.join('L') + 'Z';
  }

  // What an item shows and how big it is.
  function layout(item) {
    const cat = S.category(item.kind);
    const w = item.w || C.ITEM_WIDTH;
    // A note is written smaller and in italics, to set it apart from factors and actions.
    const size = cat === 'note' ? NOTE_SIZE : TEXT_SIZE, lineH = cat === 'note' ? NOTE_LINE_H : LINE_H;
    const lines = wrap(item.text, w - PAD * 2, size, cat === 'note');
    const label = cat === 'note' ? '' : item.kind.toUpperCase();
    let tag = cat === 'factor' ? (item.type || '') : cat === 'action' ? horizonLabel(item.horizon) : '';
    // The tag shares the top row with the label, so a long one (a type the broker wrote) is cut to fit.
    if (tag) {
      measureCtx.font = LABEL_SIZE + 'px ' + style.font;
      const room = w - PAD * 2 - 12 - measureCtx.measureText(label).width - label.length * LABEL_SPACING;
      measureCtx.font = TAG_SIZE + 'px ' + style.font;
      if (room < 30) tag = '';     // a narrow card has no room for it
      else if (measureCtx.measureText(tag).width > room) {
        while (tag.length > 1 && measureCtx.measureText(tag + '\u2026').width > room) tag = tag.slice(0, -1);
        tag = tag.trim() + '\u2026';
      }
    }
    const h = PAD * 2 + (label ? LABEL_H : 0) + lines.length * lineH;
    return { cat: cat, lines: lines, label: label, tag: tag, w: w, h: h, size: size, lineH: lineH };
  }

  function renderItems() {
    const g = layers.items;
    g.textContent = '';
    sizes = {};
    S.getBoard().items.forEach(function (item) {
      const L = layout(item);
      sizes[item.id] = { w: L.w, h: L.h };
      const selected = selection && selection.type === 'item' && selection.id === item.id;
      const node = el('g', {
        'data-item-id': item.id, cursor: 'move',
        transform: 'translate(' + (item.x - L.w / 2) + ' ' + (item.y - L.h / 2) + ')'
      }, g);
      // A factor's colour is its type and its outline shape is its kind: zig-zag for a barrier, solid for
      // an opportunity, dashed for an influence. Actions have rounded corners, notes a dotted outline.
      const colour = L.cat === 'factor' ? typeColour(item.type) : { fill: style.paper, line: style.ink };
      const box = {
        fill: colour.fill, stroke: colour.line,
        'stroke-width': selected ? style.heavy : style.line, 'stroke-linejoin': 'round'
      };
      if (item.kind === 'barrier') {
        box.d = zigzag(L.w, L.h);
        el('path', box, node);
      } else {
        box.x = 0; box.y = 0; box.width = L.w; box.height = L.h;
        if (L.cat === 'action') box.rx = 16;
        if (item.kind === 'influence') box['stroke-dasharray'] = '9 6';
        if (L.cat === 'note') { box['stroke-dasharray'] = '1 5'; box['stroke-linecap'] = 'round'; }
        el('rect', box, node);
      }

      let y = PAD;
      // Top row: the label (kind) on the left, the tag (type or time horizon) on the right.
      const small = L.cat === 'factor' ? style.ink : style.muted;
      if (L.label) {
        text(node, L.label, PAD, y + 9, LABEL_SIZE, { spacing: LABEL_SPACING, fill: small });
        if (L.tag) text(node, L.tag, L.w - PAD, y + 9, TAG_SIZE, { anchor: 'end', fill: small });
        y += LABEL_H;
      }
      L.lines.forEach(function (ln) { text(node, ln, PAD, y + L.size, L.size, { italic: L.cat === 'note' }); y += L.lineH; });

      // The two questions about a factor are shown only while the pointer is over it (see .why-button in
      // styles.css): "Why is that?" above the card, for what comes before it, and "So what?" below, for
      // what comes after. They are left out of exported images.
      if (L.cat === 'factor' && item.kind !== 'factor') {
        measureCtx.font = WHY_SIZE + 'px ' + style.font;
        const bh = 26, drop = 10;     // the buttons sit this far off the card, clear of the resize grip
        [
          { mode: 'why', label: C.FACTOR_EDITOR.whyButton, above: true },
          { mode: 'next', label: C.FACTOR_EDITOR.nextButton, above: false }
        ].forEach(function (a) {
          const bw = Math.ceil(measureCtx.measureText(a.label).width) + 26;
          const group = el('g', {
            'class': 'why-button', transform: 'translate(0 ' + (a.above ? -(drop + bh) : L.h) + ')'
          }, node);
          // An unseen strip joins the card to the button, so the pointer can travel between them
          // without the button going away.
          el('rect', { x: (L.w - bw) / 2, y: a.above ? 0 : -2, width: bw, height: drop + bh + 2, fill: 'transparent' }, group);
          const btn = el('g', {
            'data-ask': a.mode, 'data-ask-id': item.id, cursor: 'pointer',
            transform: 'translate(' + (L.w - bw) / 2 + ' ' + (a.above ? 0 : drop) + ')'
          }, group);
          el('rect', { x: 0, y: 0, width: bw, height: bh, rx: bh / 2, fill: style.ink, stroke: style.paper, 'stroke-width': style.line }, btn);
          text(btn, a.label, bw / 2, 17, WHY_SIZE, { anchor: 'middle', fill: style.paper });
        });
      }
    });
  }

  // Where the straight line from (fromX, fromY) to the centre of `item` meets the edge of its card.
  function edgePoint(item, fromX, fromY) {
    const L = layout(item);
    const dx = fromX - item.x, dy = fromY - item.y;
    if (!dx && !dy) return { x: item.x, y: item.y };
    const hw = L.w / 2 + ARROW_GAP, hh = L.h / 2 + ARROW_GAP;
    const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { x: item.x + dx * Math.min(1, t), y: item.y + dy * Math.min(1, t) };
  }

  function renderConnections() {
    const g = layers.connections;
    g.textContent = '';
    S.getBoard().connections.forEach(function (c) {
      const a = S.getItem(c.from), b = S.getItem(c.to);
      if (!a || !b) return;
      const selected = selection && selection.type === 'connection' && selection.id === c.id;
      const ends = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      // An arrowhead sits where the line meets the card it points at. The visible line stops inside the
      // arrowhead, so that the tip of the arrowhead is also the end of the line.
      const len = selected ? 16 : 13, half = selected ? 7 : 5.5;
      const shown = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      const heads = [];
      const head = function (target, other, xKey, yKey) {
        const tip = edgePoint(target, other.x, other.y);
        const ang = Math.atan2(target.y - other.y, target.x - other.x);
        const bx = tip.x - Math.cos(ang) * len, by = tip.y - Math.sin(ang) * len;
        const px = -Math.sin(ang) * half, py = Math.cos(ang) * half;
        heads.push([tip.x, tip.y, bx + px, by + py, bx - px, by - py]);
        shown[xKey] = tip.x - Math.cos(ang) * len * 0.6;
        shown[yKey] = tip.y - Math.sin(ang) * len * 0.6;
      };
      if (c.arrow === 'to' || c.arrow === 'both') head(b, a, 'x2', 'y2');
      if (c.arrow === 'from' || c.arrow === 'both') head(a, b, 'x1', 'y1');
      el('line', Object.assign({ stroke: style.ink, 'stroke-width': selected ? style.heavy : style.line }, shown), g);
      heads.forEach(function (pts) {
        el('polygon', { points: pts.map(function (n) { return n.toFixed(1); }).join(' '), fill: style.ink, stroke: 'none' }, g);
      });
      // A wide invisible line on top makes the connection easy to click.
      el('line', Object.assign({ stroke: 'transparent', 'stroke-width': 14, 'data-connection-id': c.id, cursor: 'pointer' }, ends), g);
    });
  }

  function renderOverlay() {
    const g = layers.overlay;
    g.textContent = '';
    if (selection && selection.type === 'item') {
      const it = S.getItem(selection.id), sz = sizes[selection.id];
      if (it && sz) {
        // The connection handle: a black dot on the right edge with a white arrow pointing away from
        // the card. Dragging from it draws a connection.
        const h = el('g', {
          'data-handle': it.id, cursor: 'crosshair',
          transform: 'translate(' + (it.x + sz.w / 2 + 4) + ' ' + it.y + ')'
        }, g);
        el('circle', { cx: 0, cy: 0, r: 12, fill: style.ink, stroke: style.paper, 'stroke-width': 2 }, h);
        el('path', {
          d: 'M-6 0H5M1 -4.5L5.5 0L1 4.5', fill: 'none', stroke: style.paper, 'stroke-width': 1.8,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round'
        }, h);
      }
    }
    // The resize grip: a small square on the bottom right corner of the selected card.
    // Dragging it sideways changes the card's width; the height follows the text.
    if (selection && selection.type === 'item') {
      const it = S.getItem(selection.id), sz = sizes[selection.id];
      if (it && sz) {
        el('rect', {
          x: it.x + sz.w / 2 - 6, y: it.y + sz.h / 2 - 6, width: 12, height: 12,
          fill: style.ink, stroke: style.paper, 'stroke-width': 2, 'data-resize': it.id, cursor: 'ew-resize'
        }, g);
      }
    }
    if (tempLine) {
      el('line', Object.assign({
        stroke: style.ink, 'stroke-width': style.line, 'stroke-dasharray': '4 4', 'pointer-events': 'none'
      }, tempLine), g);
    }
  }

  function render() {
    if (selection) {
      const b = S.getBoard();
      const list = selection.type === 'item' ? b.items : b.connections;
      const id = selection.id;
      if (!list.some(function (x) { return x.id === id; })) selection = null;
    }
    renderStatic();
    renderConnections();
    renderItems();
    renderOverlay();
  }

  // ---- view ----

  function applyView() {
    viewport.setAttribute('transform', 'translate(' + view.x + ' ' + view.y + ') scale(' + view.k + ')');
    call('onViewChange');
  }

  function toBoard(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.k, y: (clientY - r.top - view.y) / view.k };
  }

  // Board coordinates to page (client) coordinates.
  api.toScreen = function (x, y) {
    const r = svg.getBoundingClientRect();
    return { x: r.left + view.x + x * view.k, y: r.top + view.y + y * view.k };
  };

  api.getZoom = function () { return view.k; };

  // The board point in the middle of the visible area.
  api.viewCentre = function () {
    const r = svg.getBoundingClientRect();
    return toBoard(r.left + r.width / 2, r.top + r.height / 2);
  };

  // The box around the Surroundings circle and every item, in board units.
  api.contentBounds = function () {
    const R = C.SURROUNDINGS_RADIUS;
    let x1 = -R, y1 = -R, x2 = R, y2 = R;
    S.getBoard().items.forEach(function (it) {
      const sz = sizes[it.id] || { w: C.ITEM_WIDTH, h: 60 };
      x1 = Math.min(x1, it.x - sz.w / 2); x2 = Math.max(x2, it.x + sz.w / 2);
      y1 = Math.min(y1, it.y - sz.h / 2); y2 = Math.max(y2, it.y + sz.h / 2);
    });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };

  // Zooms and pans so the circle and every item are visible.
  api.fit = function () {
    const r = svg.getBoundingClientRect(), b = api.contentBounds(), m = 20;
    const k = Math.min((r.width - m * 2) / b.w, (r.height - m * 2) / b.h);
    view.k = Math.max(0.1, Math.min(2, k));
    view.x = r.width / 2 - (b.x + b.w / 2) * view.k;
    view.y = r.height / 2 - (b.y + b.h / 2) * view.k;
    applyView();
  };

  // Pans so the board point is visible, if it is not already comfortably in view.
  api.reveal = function (x, y) {
    const r = svg.getBoundingClientRect(), p = api.toScreen(x, y), m = 140;
    if (p.x >= r.left + m && p.x <= r.right - m && p.y >= r.top + m && p.y <= r.bottom - m) return;
    view.x = r.width / 2 - x * view.k;
    view.y = r.height / 2 - y * view.k;
    applyView();
  };

  function zoomAt(clientX, clientY, factor) {
    const p = toBoard(clientX, clientY), r = svg.getBoundingClientRect();
    view.k = Math.max(0.15, Math.min(3, view.k * factor));
    view.x = clientX - r.left - p.x * view.k;
    view.y = clientY - r.top - p.y * view.k;
    applyView();
  }

  // ---- selection ----

  api.getSelection = function () { return selection; };

  // sel: { type: 'item' | 'connection', id } or null.
  api.select = function (sel) { selection = sel; render(); call('onSelectionChange'); };

  // The middle of a connection on the page, in client pixels, or null.
  api.connectionScreenMid = function (id) {
    const c = S.getBoard().connections.filter(function (x) { return x.id === id; })[0];
    const a = c && S.getItem(c.from), b = c && S.getItem(c.to);
    if (!a || !b) return null;
    return api.toScreen((a.x + b.x) / 2, (a.y + b.y) / 2);
  };

  // Deletes the selected item or connection. Returns false if nothing was selected.
  api.deleteSelection = function () {
    if (!selection) return false;
    const s = selection;
    selection = null;
    if (s.type === 'item') S.removeItem(s.id); else S.removeConnection(s.id);
    return true;
  };

  // Where an item is on the page: { left, top, width, height } in client pixels, or null.
  api.itemScreenRect = function (id) {
    const it = S.getItem(id), sz = sizes[id];
    if (!it || !sz) return null;
    const p = api.toScreen(it.x - sz.w / 2, it.y - sz.h / 2);
    return { left: p.x, top: p.y, width: sz.w * view.k, height: sz.h * view.k };
  };

  // ---- pointer gestures ----

  function itemIdAt(clientX, clientY) {
    const at = document.elementFromPoint(clientX, clientY);
    const node = at && at.closest ? at.closest('[data-item-id]') : null;
    return node ? node.getAttribute('data-item-id') : null;
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const t = e.target;
    const handle = t.closest('[data-handle]');
    const itemEl = t.closest('[data-item-id]');
    const connEl = t.closest('[data-connection-id]');
    const whyEl = t.closest('[data-ask]');

    if (whyEl) {
      lastClick = null;
      // Opened just after the press, so that the press does not take the cursor out of the editor again.
      const ask = { id: whyEl.getAttribute('data-ask-id'), mode: whyEl.getAttribute('data-ask') };
      setTimeout(function () { call('onAsk', ask); }, 0);
      return;
    }
    const grip = t.closest('[data-resize]');
    if (grip) {
      // The card keeps its centre, so both sides move: the corner follows the pointer.
      const id = grip.getAttribute('data-resize');
      const it = S.getItem(id), p = toBoard(e.clientX, e.clientY);
      gesture = { mode: 'resize', id: id, extra: (it.w || C.ITEM_WIDTH) - 2 * (p.x - it.x), sx: e.clientX, sy: e.clientY, moved: false, own: false };
    } else if (handle) {
      gesture = { mode: 'connect', from: handle.getAttribute('data-handle'), sx: e.clientX, sy: e.clientY };
    } else if (itemEl) {
      const id = itemEl.getAttribute('data-item-id');
      const it = S.getItem(id), p = toBoard(e.clientX, e.clientY);
      api.select({ type: 'item', id: id });
      gesture = { mode: 'drag', id: id, dx: it.x - p.x, dy: it.y - p.y, sx: e.clientX, sy: e.clientY, moved: false, own: false };
    } else if (connEl) {
      api.select({ type: 'connection', id: connEl.getAttribute('data-connection-id') });
      return;
    } else {
      api.select(null);
      gesture = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!gesture) return;
    const far = Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) >= 4;
    if (gesture.mode === 'pan') {
      if (far) gesture.moved = true;
      view.x = gesture.vx + e.clientX - gesture.sx;
      view.y = gesture.vy + e.clientY - gesture.sy;
      applyView();
    } else if (gesture.mode === 'drag') {
      if (!gesture.moved) {
        if (!far) return;
        gesture.moved = true;
        gesture.own = S.begin();     // the whole drag is one undo step, unless an editor already opened one
        svg.classList.add('busy');   // no "Why is that?" button while dragging
      }
      const p = toBoard(e.clientX, e.clientY);
      S.updateItem(gesture.id, { x: p.x + gesture.dx, y: p.y + gesture.dy });
    } else if (gesture.mode === 'resize') {
      if (!gesture.moved) {
        if (!far) return;
        gesture.moved = true;
        gesture.own = S.begin();     // the whole resize is one undo step
        svg.classList.add('busy');
      }
      const it = S.getItem(gesture.id);
      if (!it) return;
      S.updateItem(gesture.id, { w: 2 * (toBoard(e.clientX, e.clientY).x - it.x) + gesture.extra });
    } else if (gesture.mode === 'connect') {
      const it = S.getItem(gesture.from);
      if (!it) return;
      const p = toBoard(e.clientX, e.clientY);
      tempLine = { x1: it.x, y1: it.y, x2: p.x, y2: p.y };
      svg.classList.add('busy');
      renderOverlay();
    }
  }

  function onPointerUp(e) {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    const g = gesture;
    gesture = null;
    svg.classList.remove('busy');
    if (!g) return;
    if (g.mode === 'connect') {
      tempLine = null;
      const target = itemIdAt(e.clientX, e.clientY);
      if (target && target !== g.from) S.addConnection(g.from, target);
      render();
      return;
    }
    if ((g.mode === 'drag' || g.mode === 'resize') && g.moved && g.own) S.commit();
    if (g.mode === 'resize') return;
    if (!g.moved) detectDoubleClick(e);
  }

  // Two clicks in the same place within 400 ms. Done by hand because the board is redrawn
  // between the clicks, which makes the browser's own dblclick event unreliable here.
  function detectDoubleClick(e) {
    const now = Date.now();
    // The second click must be the very next press after the first, so a click elsewhere in between does not count.
    const isSecond = lastClick && now - lastClick.t < 400 && lastClick.press === pressCount - 1 &&
      Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 6;
    if (!isSecond) { lastClick = { t: now, x: e.clientX, y: e.clientY, press: pressCount }; return; }
    lastClick = null;
    const at = document.elementFromPoint(e.clientX, e.clientY);
    if (!at || !svg.contains(at)) return;
    const itemEl = at.closest('[data-item-id]');
    if (itemEl) { call('onEditItem', itemEl.getAttribute('data-item-id')); return; }
    if (at.closest('[data-aim]')) { call('onEditAim'); return; }
    if (at.closest('[data-connection-id]') || at.closest('[data-handle]')) return;
    call('onBackgroundDoubleClick', toBoard(e.clientX, e.clientY));
  }

  function onWheel(e) {
    e.preventDefault();
    // A trackpad pinch arrives as a wheel event with ctrlKey set and small deltas.
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }

  // ---- export ----

  // The whole board as a standalone SVG: { svg: string, width, height }. Nothing is shown as selected.
  api.exportSvg = function () {
    const keep = selection;
    selection = null;
    render();
    const b = api.contentBounds(), m = 40;
    const w = Math.ceil(b.w + m * 2), h = Math.ceil(b.h + m * 2);
    const out = el('svg', { width: w, height: h, viewBox: (b.x - m) + ' ' + (b.y - m) + ' ' + w + ' ' + h });
    el('rect', { x: b.x - m, y: b.y - m, width: w, height: h, fill: style.paper }, out);
    ['fixed', 'connections', 'items'].forEach(function (name) { out.appendChild(layers[name].cloneNode(true)); });
    const buttons = out.querySelectorAll('.why-button');
    for (let i = 0; i < buttons.length; i++) buttons[i].parentNode.removeChild(buttons[i]);
    const str = new XMLSerializer().serializeToString(out);
    selection = keep;
    render();
    return { svg: str, width: w, height: h };
  };

  // ---- start-up ----

  api.init = function (svgElement) {
    svg = svgElement;
    readStyle();
    measureCtx = document.createElement('canvas').getContext('2d');
    viewport = el('g', {}, svg);
    ['fixed', 'connections', 'items', 'overlay'].forEach(function (name) { layers[name] = el('g', {}, viewport); });
    document.addEventListener('pointerdown', function () { pressCount += 1; }, true);
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('wheel', onWheel, { passive: false });
    S.subscribe(render);
    render();
    api.fit();
  };

  return api;
})();
