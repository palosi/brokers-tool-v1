window.BT = window.BT || {};

// The factor editor, the action editor, the aspiration questions form, and in-place text editing for notes.
BT.editor = (function () {
  const C = BT.config, S = BT.state, V = BT.canvas;
  const api = {};

  let box;               // the #editor element
  let current = null;    // { target: 'item' | 'aim', id, cat, own, slider, textarea }; only 'own' is set for the aim

  // Outline samples for the kind cards: zig-zag for a barrier, solid for an opportunity, dashed for an influence.
  const EDGE_ATTRS = ' fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"';
  const EDGE_SAMPLES = {
    barrier: '<polyline points="0,8 3,4 6,8 9,4 12,8 15,4 18,8 21,4 24,8 27,4 30,8 33,4 36,8 39,4 42,8 45,4 48,8 51,4 54,8 57,4 60,8 63,4 66,8 69,4 72,8 75,4 78,8 81,4 84,8 87,4 90,8 93,4 96,8 99,4 102,8 105,4 108,8 111,4 114,8 117,4 120,8"' + EDGE_ATTRS + '/>',
    opportunity: '<line x1="0" y1="6" x2="120" y2="6"' + EDGE_ATTRS + '/>',
    influence: '<line x1="0" y1="6" x2="120" y2="6" stroke-dasharray="7 5"' + EDGE_ATTRS + '/>'
  };

  function make(tag, className, textContent) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (textContent) e.textContent = textContent;
    return e;
  }

  function field(labelText) {
    const label = make('label', 'field');
    label.appendChild(make('span', '', labelText));
    return label;
  }

  function textArea(value, rows, placeholder, onInput) {
    const ta = make('textarea');
    ta.rows = rows;
    ta.value = value;
    ta.placeholder = placeholder;
    ta.addEventListener('input', function () { onInput(ta.value); });
    return ta;
  }

  function show(className) {
    box.className = 'editor ' + className;
    box.hidden = false;
  }

  function hide() {
    box.hidden = true;
    box.textContent = '';
    board().classList.remove('typing');
  }

  function board() { return document.getElementById('board'); }

  // ---- building the three item editors ----

  // The CSS variable names for a factor's colours: its type's fill and outline.
  function typeVars(type) {
    if (!type) return { fill: '--paper', line: '--ink' };
    for (let i = 0; i < C.TYPES.length; i++) {
      if (C.TYPES[i].name === type) return { fill: '--type-' + (i + 1), line: '--type-' + (i + 1) + '-line' };
    }
    return { fill: '--type-own', line: '--type-own-line' };
  }

  // The factor that a why question is about, quoted at the top of the editor in its own colours.
  function buildQuote(source) {
    const q = make('blockquote', 'quote');
    const vars = typeVars(source.type);
    q.style.background = 'var(' + vars.fill + ')';
    q.style.borderColor = 'var(' + vars.line + ')';
    const head = make('div', 'quote-head');
    head.appendChild(make('span', '', source.kind));
    if (source.type) head.appendChild(make('span', '', source.type));
    q.appendChild(head);
    if (source.text.trim()) q.appendChild(make('p', '', source.text));
    return q;
  }

  // The large factor editor: one question for each thing to reflect on.
  // With ask ({ source, mode }), it is the why editor or the what-follows editor: the factor being asked
  // about is quoted at the top
  // and the first question asks what is behind it.
  function buildFactor(item, ask) {
    const whySource = ask ? ask.source : null;
    const next = !!ask && ask.mode === 'next';
    const id = item.id, T = C.FACTOR_EDITOR;
    const block = function (question) {
      const s = make('section', 'block');
      s.appendChild(make('h3', '', question));
      return s;
    };
    const columns = make('div', 'columns');
    const left = make('div'), right = make('div');
    columns.appendChild(left);
    columns.appendChild(right);
    box.appendChild(columns);

    // Kind: three cards, each explaining what it means.
    const kindBlock = block(whySource ? T.whyKindQuestion : T.kindQuestion);
    const cards = make('div', 'cards');
    let checked = null, first = null;
    C.FACTOR_KINDS.forEach(function (k) {
      const card = make('label', 'card');
      card.setAttribute('data-kind', k.id);
      const radio = make('input');
      radio.type = 'radio'; radio.name = 'factor-kind'; radio.value = k.id;
      radio.checked = item.kind === k.id;
      if (radio.checked) card.classList.add('selected');
      radio.addEventListener('change', function () {
        S.updateItem(id, { kind: k.id });
        for (let i = 0; i < cards.children.length; i++) cards.children[i].classList.toggle('selected', cards.children[i] === card);
      });
      card.appendChild(radio);
      // A sample of the outline this kind has on the board.
      const edge = make('div', 'edge');
      edge.innerHTML = '<svg viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">' + EDGE_SAMPLES[k.id] + '</svg>';
      card.appendChild(edge);
      card.appendChild(make('strong', '', k.label));
      card.appendChild(make('span', '', k.description));
      cards.appendChild(card);
      if (!first) first = radio;
      if (radio.checked) checked = radio;
    });
    kindBlock.appendChild(cards);

    // Description.
    const descBlock = block(!whySource ? T.descriptionQuestion : next ? T.nextQuestion : T.whyQuestion);
    const promptText = next ? T.nextPrompt : T.whyPrompt;
    const ta = textArea(item.text, 4, '', function (v) { S.updateItem(id, { text: v }); });
    if (whySource && promptText) descBlock.insertBefore(make('p', 'prompt', promptText), null);
    descBlock.appendChild(ta);

    // Asking why starts from the quoted factor and the question about it; the kind comes after.
    if (whySource) {
      left.appendChild(buildQuote(whySource));
      left.appendChild(descBlock);
      left.appendChild(kindBlock);
    } else {
      left.appendChild(kindBlock);
      left.appendChild(descBlock);
    }

    // Realm of influence. The factor stays where it is while its editor is open;
    // the new distance is applied on closing.
    const scaleBlock = block(T.scaleQuestion);
    const slider = make('input');
    slider.type = 'range'; slider.min = 0; slider.max = 100; slider.step = 1;
    slider.value = S.scaleFromPos(item.x, item.y);
    slider.addEventListener('input', function () { current.scaleChanged = true; });
    scaleBlock.appendChild(slider);
    const ends = make('div', 'scale-ends');
    ends.appendChild(make('span', '', C.SCALE_LOW));
    ends.appendChild(make('span', '', C.SCALE_HIGH));
    scaleBlock.appendChild(ends);
    left.appendChild(scaleBlock);
    current.slider = slider;

    // Type: one row per type with its explanation, and a last row for writing your own.
    // Clicking the chosen row again clears the type.
    const OWN = '__own__';
    const typeBlock = block(T.typeQuestion);
    const list = make('div', 'types');
    const input = make('input');
    input.type = 'text';
    input.placeholder = T.ownTypeHelp;
    const names = C.TYPES.map(function (t) { return t.name; });
    let chosen = !item.type ? '' : names.indexOf(item.type) >= 0 ? item.type : OWN;
    input.value = chosen === OWN ? item.type : '';
    const rows = [];
    const refresh = function () {
      rows.forEach(function (r) { r.el.classList.toggle('selected', r.value === chosen); });
      input.hidden = chosen !== OWN;
    };
    const addRow = function (value, name, description, colour) {
      const row = make('button', 'type');
      row.type = 'button';
      row.setAttribute('data-type', value);
      const swatch = make('i', 'swatch');
      swatch.style.background = 'var(' + colour + ')';     // the colours a factor of this type has on the board
      swatch.style.borderColor = 'var(' + colour + '-line)';
      row.appendChild(swatch);
      row.appendChild(make('strong', '', name));
      row.appendChild(make('span', '', description));
      row.addEventListener('click', function () {
        chosen = chosen === value ? '' : value;
        refresh();
        S.updateItem(id, { type: chosen === OWN ? input.value : chosen });
        api.reposition();     // the write-your-own box changes the panel's height
        if (chosen === OWN) input.focus();
      });
      rows.push({ el: row, value: value });
      list.appendChild(row);
    };
    C.TYPES.forEach(function (t, i) { addRow(t.name, t.name, t.description, '--type-' + (i + 1)); });
    addRow(OWN, T.ownType, T.ownTypeHelp, '--type-own');
    input.addEventListener('input', function () { S.updateItem(id, { type: input.value }); });
    refresh();
    typeBlock.appendChild(list);
    typeBlock.appendChild(input);
    right.appendChild(typeBlock);

    // Additional notes: kept with the factor, shown only here and never on the card.
    const notesBlock = block(T.notesQuestion);
    // The box starts two lines tall and grows with what is written, up to a point.
    const notes = textArea(item.notes || '', 2, '', function (v) { S.updateItem(id, { notes: v }); grow(); });
    const grow = function () {
      notes.style.height = 'auto';
      notes.style.height = Math.min(notes.scrollHeight + 2, 200) + 'px';
    };
    current.grow = grow;
    notes.setAttribute('data-notes', '1');
    notesBlock.appendChild(notes);
    right.appendChild(notesBlock);

    return checked ? ta : first;
  }

  function buildAction(item) {
    const id = item.id;

    const desc = field('Description');
    const ta = textArea(item.text, 3, 'What can you do?', function (v) { S.updateItem(id, { text: v }); });
    desc.appendChild(ta);
    box.appendChild(desc);

    const horizon = field('Time horizon');
    const select = make('select');
    const none = make('option', '', 'Not chosen');
    none.value = '';
    select.appendChild(none);
    C.HORIZONS.forEach(function (h) {
      const opt = make('option', '', h.label);
      opt.value = h.id;
      select.appendChild(opt);
    });
    select.value = item.horizon || '';
    select.addEventListener('change', function () { S.updateItem(id, { horizon: select.value }); });
    horizon.appendChild(select);
    box.appendChild(horizon);

    return ta;
  }

  // The row at the bottom of an editor: Delete on the left (for items), Done on the right.
  function addButtons(withDelete) {
    const row = make('div', 'actions');
    if (withDelete) {
      const del = make('button', '', 'Delete');
      del.type = 'button';
      del.setAttribute('data-delete', '1');
      del.addEventListener('click', function () { api.remove(); });
      row.appendChild(del);
    } else {
      row.appendChild(make('span'));
    }
    const done = make('button', '', 'Done');
    done.type = 'button';
    done.setAttribute('data-done', '1');
    done.addEventListener('click', function () { api.close(); });
    row.appendChild(done);
    box.appendChild(row);
  }

  // whyId: the factor this new factor is about, when the editor was opened from "Why is that?" (mode
  // 'why') or "So what?" (mode 'next').
  // fresh: the item was added just now, by the same click that opened the editor.
  function openItem(id, own, whyId, fresh, mode) {
    const item = S.getItem(id);
    if (!item) { if (own) S.cancel(); return; }
    const cat = S.category(item.kind);
    const whySource = whyId ? S.getItem(whyId) : null;
    current = { target: 'item', id: id, cat: cat, own: own, slider: null, scaleChanged: false, textarea: null, fresh: !!fresh };
    V.select({ type: 'item', id: id });
    box.textContent = '';

    let focus;
    if (cat === 'note') {
      focus = textArea(item.text, 1, '', function (v) { S.updateItem(id, { text: v }); });
      current.textarea = focus;
      box.appendChild(focus);
      show('inline note');
      // While a note is being typed, its connection handle and resize grip are hidden.
      board().classList.add('typing');
    } else {
      focus = cat === 'action' ? buildAction(item) : buildFactor(item, whySource ? { source: whySource, mode: mode } : null);
      addButtons(true);
      show(cat === 'action' ? 'form' : 'form factor');
    }
    if (current.grow) current.grow();     // needs the editor to be on the page to measure the text
    api.reposition();
    focus.focus();
    if (focus.tagName === 'TEXTAREA') focus.setSelectionRange(focus.value.length, focus.value.length);
  }

  // ---- public ----

  api.isOpen = function () { return current !== null; };

  // Opens the editor for an existing item.
  api.open = function (id) {
    if (current && current.target === 'item' && current.id === id) return;
    api.close();
    openItem(id, S.begin());
  };

  // Adds an item and opens its editor. kind: 'factor', 'action' or 'note'.
  // A new factor starts as an influence; the broker can choose another kind in the editor.
  api.openNew = function (kind, x, y) {
    api.close();
    const own = S.begin();
    const id = S.addItem(kind === 'factor' ? C.DEFAULT_FACTOR_KIND : kind, x, y);
    const it = S.getItem(id);
    V.reveal(it.x, it.y);
    openItem(id, own, null, true);
  };

  // Asks about a factor: why it is like this (mode 'why') or what follows from it (mode 'next').
  // Adds a factor beside it, joined by an arrow, and opens the editor for the new factor with the
  // original quoted. A reason points at the original; the original points at what follows from it.
  // All of it is one undo step.
  api.openAsk = function (sourceId, mode) {
    api.close();
    const source = S.getItem(sourceId);
    if (!source || S.category(source.kind) !== 'factor' || source.kind === 'factor') return;
    const next = mode === 'next';
    const own = S.begin();
    const p = S.whySpot(sourceId, next ? -1 : 1);     // reasons on one side, what follows on the other
    const id = S.addItem(C.DEFAULT_FACTOR_KIND, p.x, p.y);
    if (next) S.addConnection(sourceId, id, 'to'); else S.addConnection(id, sourceId, 'to');
    const it = S.getItem(id);
    V.reveal(it.x, it.y);
    openItem(id, own, sourceId, true, next ? 'next' : 'why');
  };

  // Opens the aspiration questions as a form on top of the Aim circle.
  api.openAim = function () {
    if (current && current.target === 'aim') return;
    api.close();
    current = { target: 'aim', own: S.begin() };
    box.textContent = '';
    // A large centred panel like the factor editor, with one block per aspiration question.
    let first = null;
    C.ASPIRATION_QUESTIONS.forEach(function (q) {
      const b = make('div', 'block');
      b.appendChild(make('h3', '', q.text));
      const ta = textArea(S.getBoard().aspiration[q.id], 3, '', function (v) { S.setAspiration(q.id, v); });
      b.appendChild(ta);
      box.appendChild(b);
      if (!first) first = ta;
    });
    addButtons(false);
    show('form factor aim');
    api.reposition();
    first.focus();
    first.setSelectionRange(first.value.length, first.value.length);
  };

  // Closes the editor and keeps the changes as one undo step.
  api.close = function () {
    if (!current) return;
    const c = current;
    const scale = c.slider && c.scaleChanged ? Number(c.slider.value) : null;
    current = null;
    hide();
    if (c.target === 'item') {
      const item = S.getItem(c.id);
      // A factor that was added just now and left without a description is removed again.
      if (item && (item.kind === 'factor' || (c.fresh && c.cat === 'factor' && !item.text.trim()))) {
        if (c.own) S.cancel(); else S.removeItem(c.id);
        return;
      }
      // Move the factor to the distance chosen on the realm of influence scale.
      if (item && scale !== null) {
        const p = S.posFromScale(item.x, item.y, scale);
        S.updateItem(c.id, { x: p.x, y: p.y });
      }
      // An empty note is removed.
      if (item && item.kind === 'note' && !item.text.trim()) S.removeItem(c.id);
    }
    if (c.own) S.commit();
  };

  // Closes the editor and deletes the item it was editing, as one undo step.
  api.remove = function () {
    if (!current || current.target !== 'item') return;
    const c = current;
    current = null;
    hide();
    S.removeItem(c.id);
    if (c.own) S.commit();
  };

  // Closes the editor and throws away everything done since it opened.
  api.discard = function () {
    if (!current) return;
    const c = current;
    current = null;
    hide();
    if (c.own) S.cancel();
  };

  // Keeps the editor next to (or on top of) what it edits. Called after every state or view change.
  api.reposition = function () {
    if (!current) return;
    const stage = box.parentNode.getBoundingClientRect();
    const k = V.getZoom();


    // The aim and factor editors always open in the middle of the board area.
    if (current.target === 'aim' || current.cat === 'factor') {
      box.style.width = '';
      box.style.left = Math.max(12, (stage.width - box.offsetWidth) / 2) + 'px';
      box.style.top = Math.max(12, (stage.height - box.offsetHeight) / 2) + 'px';
      return;
    }

    const r = V.itemScreenRect(current.id);
    if (!r) return;
    if (current.cat === 'note') {
      const ta = current.textarea;
      box.style.width = r.width + 'px';
      box.style.left = (r.left - stage.left) + 'px';
      box.style.top = (r.top - stage.top) + 'px';
      ta.style.fontSize = (11 * k) + 'px';
      ta.style.padding = (10 * k) + 'px';
      ta.style.height = 'auto';
      ta.style.height = Math.max(r.height, ta.scrollHeight) + 'px';
      return;
    }

    box.style.width = '';
    let left = r.left - stage.left + r.width + 12;
    if (left + box.offsetWidth > stage.width - 8) left = r.left - stage.left - box.offsetWidth - 12;
    let top = r.top - stage.top;
    top = Math.max(8, Math.min(top, stage.height - box.offsetHeight - 8));
    box.style.left = Math.max(8, left) + 'px';
    box.style.top = top + 'px';
  };

  function onStateChange() {
    if (!current) return;
    if (current.target === 'item') {
      const item = S.getItem(current.id);
      if (!item) { current = null; hide(); return; }
      if (current.slider && !current.scaleChanged) current.slider.value = S.scaleFromPos(item.x, item.y);
    }
    api.reposition();
  }

  api.init = function (element) {
    box = element;
    S.subscribe(onStateChange);

    // Enter closes and keeps; Shift+Enter is a line break; Escape closes and discards.
    // Enter on a button presses that button instead.
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'BUTTON') { e.preventDefault(); api.close(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.discard(); }
    });

    // A note being typed can be moved by dragging the frame around its text box.
    // The move belongs to the same undo step as the typing.
    box.addEventListener('mousedown', function (e) { if (e.target === box) e.preventDefault(); });
    box.addEventListener('pointerdown', function (e) {
      if (e.target !== box || e.button !== 0 || !current || current.cat !== 'note') return;
      const item = S.getItem(current.id);
      if (!item) return;
      const id = current.id, x0 = item.x, y0 = item.y, sx = e.clientX, sy = e.clientY;
      const move = function (ev) {
        const k = V.getZoom();
        S.updateItem(id, { x: x0 + (ev.clientX - sx) / k, y: y0 + (ev.clientY - sy) / k });
      };
      const stop = function () {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });

    // Clicking anywhere else closes the editor. The item being edited is the exception: it stays
    // where it is and cannot be dragged while its editor is open, but it can be connected from its handle.
    document.addEventListener('pointerdown', function (e) {
      if (!current || box.contains(e.target)) return;
      const t = e.target;
      if (current.target === 'item' && t.closest) {
        const itemEl = t.closest('[data-item-id]');
        if (itemEl && itemEl.getAttribute('data-item-id') === current.id) { e.stopPropagation(); return; }
        const handle = t.closest('[data-handle]');
        if (handle && handle.getAttribute('data-handle') === current.id) return;
      }
      api.close();
    }, true);
  };

  return api;
})();
