window.BT = window.BT || {};

// Toolbar, Instructions panel, notices, the confirmation dialog and keyboard shortcuts.
BT.ui = (function () {
  const C = BT.config, S = BT.state, V = BT.canvas, E = BT.editor;
  const api = {};
  const $ = function (id) { return document.getElementById(id); };
  let onConfirm = null;

  // ---- notices and confirmation ----

  // Shows a one-line message under the toolbar. An empty message hides it.
  api.notice = function (message) {
    $('notice-text').textContent = message || '';
    $('notice').hidden = !message;
  };

  // Asks a yes/no question inside the page. onOk runs only if the user agrees.
  api.confirm = function (message, okLabel, onOk) {
    $('dialog-text').textContent = message;
    $('dialog-ok').textContent = okLabel;
    onConfirm = onOk;
    $('dialog').hidden = false;
    $('dialog-cancel').focus();
  };

  function closeDialog(agreed) {
    const fn = onConfirm;
    onConfirm = null;
    $('dialog').hidden = true;
    if (agreed && fn) fn();
  }

  // ---- panels ----

  function buildInstructions() {
    const fill = function (listId, lines) {
      lines.forEach(function (line) {
        const li = document.createElement('li');
        li.textContent = line;
        $(listId).appendChild(li);
      });
    };
    fill('instructions-list', C.INSTRUCTIONS);
    fill('instructions-tips', C.INSTRUCTIONS_TIPS);
    $('board-hint').textContent = C.BOARD_HINT;
  }

  // ---- connection menu ----

  function selectedConnection() {
    const sel = V.getSelection();
    if (!sel || sel.type !== 'connection') return null;
    return S.getBoard().connections.filter(function (c) { return c.id === sel.id; })[0] || null;
  }

  // Shows the arrow choices at the middle of the selected connection, and hides them otherwise.
  function syncConnectionMenu() {
    const menu = $('connection-menu'), c = selectedConnection();
    const mid = c ? V.connectionScreenMid(c.id) : null;
    menu.hidden = !mid;
    if (!mid) return;
    const stage = menu.parentNode.getBoundingClientRect();
    menu.style.left = (mid.x - stage.left) + 'px';
    menu.style.top = (mid.y - stage.top) + 'px';
    const state = !c.arrow ? 'none' : c.arrow === 'both' ? 'both' : 'one';
    const buttons = menu.querySelectorAll('button');
    for (let i = 0; i < buttons.length; i++) {
      const name = buttons[i].getAttribute('data-arrow');
      if (name === 'reverse') buttons[i].disabled = state !== 'one';
      else buttons[i].setAttribute('aria-pressed', String(name === state));
    }
  }

  function wireConnectionMenu() {
    const menu = $('connection-menu');
    const buttons = menu.querySelectorAll('button');
    for (let i = 0; i < buttons.length; i++) buttons[i].textContent = C.CONNECTION_MENU[buttons[i].getAttribute('data-arrow')];
    // Keep the keyboard on the board, so Delete still removes the selected connection.
    menu.addEventListener('mousedown', function (e) { e.preventDefault(); });
    menu.addEventListener('click', function (e) {
      const button = e.target.closest('button'), c = selectedConnection();
      if (!button || !c) return;
      const name = button.getAttribute('data-arrow');
      if (name === 'none') S.setConnectionArrow(c.id, '');
      else if (name === 'both') S.setConnectionArrow(c.id, 'both');
      else if (name === 'one') S.setConnectionArrow(c.id, c.arrow === 'from' ? 'from' : 'to');
      else if (name === 'reverse') S.setConnectionArrow(c.id, c.arrow === 'to' ? 'from' : 'to');
    });
  }

  // ---- toolbar ----

  // The middle of the view, moved off the Aim circle and nudged until no item sits exactly there.
  function freeCentre() {
    let p = V.viewCentre();
    const clear = C.AIM_RADIUS + 60;
    if (Math.hypot(p.x, p.y) < clear) p = { x: p.x, y: clear };
    const taken = function (q) {
      return S.getBoard().items.some(function (it) { return Math.abs(it.x - q.x) < 2 && Math.abs(it.y - q.y) < 2; });
    };
    while (taken(p)) p = { x: p.x + 24, y: p.y + 24 };
    return p;
  }

  // The Demo button shows the demo board; pressed again it brings back the broker's own board.
  function setDemo(on) {
    E.close();
    if (on && BT.demoBoard) {
      const err = S.showDemo(BT.demoBoard);
      if (err) api.notice(err);
    } else {
      S.leaveDemo();
    }
    $('demo').setAttribute('aria-pressed', String(S.inDemo()));
    V.select(null);
    V.fit();
  }

  function wireToolbar() {
    $('demo').textContent = C.DEMO_BUTTON;
    $('demo').hidden = !BT.demoBoard;
    $('demo').addEventListener('click', function () { setDemo(!S.inDemo()); });
    $('file-buttons').hidden = !C.FILE_BUTTONS;
    $('add-factor').addEventListener('click', function () {
      E.close();
      const p = S.freeFactorSpot();
      E.openNew('factor', p.x, p.y);
    });
    $('add-action').addEventListener('click', function () {
      E.close();
      const p = freeCentre();
      E.openNew('action', p.x, p.y);
    });
    $('add-note').addEventListener('click', function () {
      E.close();
      const p = freeCentre();
      E.openNew('note', p.x, p.y);
    });
    // Instructions are closed until asked for; the toolbar button opens and closes them.
    $('instructions-toggle').addEventListener('click', function () {
      const panel = $('instructions-panel');
      panel.hidden = !panel.hidden;
      $('instructions-toggle').setAttribute('aria-expanded', String(!panel.hidden));
    });
    $('export').addEventListener('click', function () { E.close(); BT.io.exportBoard(); });
    $('open').addEventListener('click', function () { E.close(); $('file-input').click(); });
    $('file-input').addEventListener('change', function () {
      const file = $('file-input').files[0];
      $('file-input').value = '';
      if (file) BT.io.openFile(file);
    });
    $('new').addEventListener('click', function () {
      E.close();
      api.confirm('Clear the whole board, including the answers in the Aim circle, and start again?', 'Clear board', function () {
        S.newBoard();
        V.fit();
      });
    });
    $('notice-close').addEventListener('click', function () { api.notice(''); });
    $('dialog-cancel').addEventListener('click', function () { closeDialog(false); });
    $('dialog-ok').addEventListener('click', function () { closeDialog(true); });
  }

  // ---- keyboard ----

  function onKeyDown(e) {
    if (!$('dialog').hidden) {
      if (e.key === 'Escape') closeDialog(false);
      return;
    }
    const tag = e.target && e.target.tagName;
    // In a text field the keys keep their usual meaning, including Cmd/Ctrl+Z for undoing typing.
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      E.close();
      if (e.shiftKey) S.redo(); else S.undo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!V.getSelection()) return;
      e.preventDefault();
      E.close();
      V.deleteSelection();
    } else if (e.key === 'Escape') {
      E.discard();
    }
  }

  // ---- start-up ----

  api.init = function () {
    let store = null;
    try { store = window.localStorage; } catch (e) { store = null; }
    S.init(store);

    buildInstructions();
    wireToolbar();

    V.handlers.onEditItem = function (id) { E.open(id); };
    V.handlers.onEditAim = function () { E.openAim(); };
    V.handlers.onAsk = function (ask) { E.openAsk(ask.id, ask.mode); };
    V.handlers.onBackgroundDoubleClick = function (p) { E.openNew('note', p.x, p.y); };
    V.handlers.onViewChange = function () { E.reposition(); syncConnectionMenu(); };
    V.handlers.onSelectionChange = syncConnectionMenu;

    V.init($('board'));
    E.init($('editor'));
    wireConnectionMenu();
    S.subscribe(syncConnectionMenu);
    document.addEventListener('keydown', onKeyDown);
    if (S.demoWasOn()) setDemo(true);     // the demo stays on over a reload

    if (!S.storageAvailable()) {
      api.notice('This browser is not saving the board. It will be lost if the page is refreshed or closed. Use Export to keep it.');
    }
  };

  return api;
})();
