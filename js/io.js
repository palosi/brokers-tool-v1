window.BT = window.BT || {};

// Export to a board file (JSON) and an image (PNG), and opening a board file.
BT.io = (function () {
  const S = BT.state, V = BT.canvas;
  const api = {};
  const IMAGE_FAILED = 'The image could not be created. The board file was still exported.';

  function stamp() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function download(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // Downloads brokers-board-<date>-<time>.json and .png.
  api.exportBoard = function () {
    const name = 'brokers-board-' + stamp();
    download(new Blob([S.serialise()], { type: 'application/json' }), name + '.json');

    const out = V.exportSvg();
    // Twice the board size for a sharp image, but never wider or taller than 8000 pixels.
    const scale = Math.min(2, 8000 / Math.max(out.width, out.height));
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(out.width * scale);
      canvas.height = Math.round(out.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) {
        if (blob) download(blob, name + '.png'); else BT.ui.notice(IMAGE_FAILED);
      }, 'image/png');
    };
    img.onerror = function () { BT.ui.notice(IMAGE_FAILED); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out.svg);
  };

  // Reads a file chosen by the user and, after confirmation, replaces the board with it.
  api.openFile = function (file) {
    const reader = new FileReader();
    reader.onerror = function () { BT.ui.notice('That file could not be read.'); };
    reader.onload = function () {
      let obj;
      try { obj = JSON.parse(reader.result); }
      catch (e) { BT.ui.notice('That file could not be read as a board file.'); return; }
      const problem = S.validate(obj);
      if (problem) { BT.ui.notice(problem); return; }
      BT.ui.confirm('Replace the current board with the one in "' + file.name + '"?', 'Open board', function () {
        S.loadBoard(obj);
        V.fit();
        BT.ui.notice('');
      });
    };
    reader.readAsText(file);
  };

  return api;
})();
