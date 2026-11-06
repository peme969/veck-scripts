// ==UserScript==
// @name        WASD WITH MOUSE
// @namespace    http://tampermonkey.net
// @version      2.0
// @description  Draggable + resizable HUD. Mouse color customization. Tabbed settings.
// @author       Enhanced
// @match        *://veck.io/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULTS = {
        hud: {
            visible: true, color: '#00e5ff', opacity: 0.96, chroma: true,
            width: 210,
            x: null, y: null
        },
        modules: { fps: true, graph: true, ping: true, cps: true, keys: true, mouse: true },
        mouse: {
            lmb:     '#00e5ff',
            rmb:     '#ff2d78',
            wheel:   '#aaaaaa',
            side:    '#ffb700',
            body:    '#0a1520',
            outline: '#ffffff',
            labels:  true,
            ripples: true,
            scale:   1.0
        },
        layout: {
            keyH:    30,
            gap:     3,
            padding: 9
        }
    };

    let state = (function () {
        try {
            var s = JSON.parse(localStorage.getItem('vhp15') || '{}');
            return {
                hud:     Object.assign({}, DEFAULTS.hud,     s.hud     || {}),
                modules: Object.assign({}, DEFAULTS.modules, s.modules || {}),
                mouse:   Object.assign({}, DEFAULTS.mouse,   s.mouse   || {}),
                layout:  Object.assign({}, DEFAULTS.layout,  s.layout  || {})
            };
        } catch (e) { return JSON.parse(JSON.stringify(DEFAULTS)); }
    })();

    function save() {
        try { localStorage.setItem('vhp15', JSON.stringify(state)); } catch (e) {}
    }

    var showMenu   = false;
    var activeTab  = 'hud';
    var keys       = {}, clicks = [], fpsHist = [];
    for (var _i = 0; _i < 60; _i++) fpsHist.push(0);
    var fps = 0, lastT = performance.now(), ping = 0, scrollDir = 0, scrollTO;


    var CSS = `
        @keyframes vhChroma {
            0%   { border-color:#00e5ff; box-shadow:0 0 0 1px #000,0 0 22px rgba(0,229,255,.25),inset 0 0 30px rgba(0,229,255,.04); }
            16%  { border-color:#00ff9f; box-shadow:0 0 0 1px #000,0 0 22px rgba(0,255,159,.25),inset 0 0 30px rgba(0,255,159,.04); }
            33%  { border-color:#7b2fff; box-shadow:0 0 0 1px #000,0 0 22px rgba(123,47,255,.25),inset 0 0 30px rgba(123,47,255,.04); }
            50%  { border-color:#ff2d78; box-shadow:0 0 0 1px #000,0 0 22px rgba(255,45,120,.25),inset 0 0 30px rgba(255,45,120,.04); }
            66%  { border-color:#ff9500; box-shadow:0 0 0 1px #000,0 0 22px rgba(255,149,0,.25), inset 0 0 30px rgba(255,149,0,.04);  }
            83%  { border-color:#fff500; box-shadow:0 0 0 1px #000,0 0 22px rgba(255,245,0,.25), inset 0 0 30px rgba(255,245,0,.04);  }
            100% { border-color:#00e5ff; box-shadow:0 0 0 1px #000,0 0 22px rgba(0,229,255,.25),inset 0 0 30px rgba(0,229,255,.04); }
        }
        @keyframes vhScan   { 0%{top:-60%} 100%{top:160%} }
        @keyframes vhPulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes vhBlink  { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes vhKeyOn  { 0%{transform:scale(1)} 40%{transform:scale(.85)} 100%{transform:scale(1)} }
        @keyframes vhFadeIn { from{opacity:0;transform:translateX(8px)} to{opacity:1;transform:none} }

        /* â”€â”€ HUD â”€â”€ */
        .vh-panel {
            position:fixed; z-index:999999;
            user-select:none; -webkit-user-select:none;
            font-family:'Courier New',Courier,monospace;
            background:linear-gradient(160deg,#060e16,#03070d);
            border:1px solid #00e5ff;
            box-shadow:0 0 0 1px #000,0 0 22px rgba(0,229,255,.25),inset 0 0 30px rgba(0,229,255,.04);
            overflow:hidden;
            animation:vhFadeIn .3s ease forwards;
            min-width:160px;
        }
        .vh-panel.chroma { animation:vhChroma 5s linear infinite,vhFadeIn .3s ease forwards; }

        .vh-scanline {
            position:absolute; left:0; right:0; height:60%;
            background:linear-gradient(transparent 30%,rgba(0,229,255,.035) 50%,transparent 70%);
            animation:vhScan 5s linear infinite;
            pointer-events:none; z-index:1;
        }
        .vh-grid {
            position:absolute; inset:0;
            background-image:linear-gradient(rgba(0,229,255,.035) 1px,transparent 1px),
                             linear-gradient(90deg,rgba(0,229,255,.035) 1px,transparent 1px);
            background-size:14px 14px;
            pointer-events:none; z-index:0;
        }
        .vh-c { position:absolute; width:10px; height:10px; pointer-events:none; z-index:5; }
        .vh-c.tl { top:-1px;    left:-1px;  border-top:2px solid #00e5ff; border-left:2px solid #00e5ff; }
        .vh-c.tr { top:-1px;    right:-1px; border-top:2px solid #00e5ff; border-right:2px solid #00e5ff; }
        .vh-c.bl { bottom:-1px; left:-1px;  border-bottom:2px solid #00e5ff; border-left:2px solid #00e5ff; }
        .vh-c.br { bottom:-1px; right:-1px; border-bottom:2px solid #00e5ff; border-right:2px solid #00e5ff; }

        /* â”€â”€ HEADER â”€â”€ */
        .vh-header {
            display:flex; align-items:center; justify-content:space-between;
            padding:7px 11px 6px;
            background:linear-gradient(90deg,rgba(0,229,255,.1),rgba(0,229,255,.02));
            border-bottom:1px solid rgba(0,229,255,.15);
            cursor:grab; position:relative; z-index:10;
        }
        .vh-header:active { cursor:grabbing; }
        .vh-title { font-size:11px; font-weight:bold; letter-spacing:3px; color:#00e5ff; text-shadow:0 0 12px #00e5ff; }
        .vh-dots  { display:flex; gap:4px; }
        .vh-dot   { width:6px; height:6px; border-radius:50%; animation:vhPulse 2s ease infinite; }
        .vh-tag   { font-size:8px; letter-spacing:1px; color:rgba(255,255,255,.2); border:1px solid rgba(255,255,255,.1); padding:1px 5px; cursor:pointer; }
        .vh-tag:hover { color:rgba(255,255,255,.5); border-color:rgba(255,255,255,.3); }

        /* â”€â”€ BODY â”€â”€ */
        .vh-body { display:flex; flex-direction:column; position:relative; z-index:2; }

        /* â”€â”€ STAT BOXES â”€â”€ */
        .vh-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; }
        .vh-sbox  { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08); padding:5px 4px 4px; display:flex; flex-direction:column; align-items:center; gap:1px; }
        .vh-slbl  { font-size:7px; letter-spacing:2px; color:rgba(255,255,255,.3); }
        .vh-sval  { font-size:18px; font-weight:bold; line-height:1; text-shadow:0 0 12px currentColor; }
        .vh-sunit { font-size:7px; color:rgba(255,255,255,.2); }

        /* â”€â”€ GRAPH â”€â”€ */
        .vh-graph-wrap { border:1px solid rgba(0,229,255,.12); background:rgba(0,0,0,.3); height:32px; position:relative; overflow:hidden; }
        .vh-graph-lbl  { position:absolute; top:2px; left:5px; z-index:2; font-size:7px; letter-spacing:1.5px; color:rgba(0,229,255,.35); }
        .vh-graph-wrap canvas { display:block; width:100%; height:100%; }

        /* â”€â”€ SEPARATOR â”€â”€ */
        .vh-sep { height:1px; background:linear-gradient(90deg,transparent,rgba(0,229,255,.2) 30%,rgba(0,229,255,.2) 70%,transparent); margin:1px 0; position:relative; }
        .vh-sep-ico { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); font-size:8px; color:rgba(0,229,255,.5); background:#040a0f; padding:0 4px; }

        /* â”€â”€ KEYS â”€â”€ */
        .vh-keys { display:grid; grid-template-columns:repeat(6,1fr); }
        .vh-key  { display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:bold; letter-spacing:.5px; color:rgba(255,255,255,.3); background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); transition:background .06s,color .06s,border-color .06s,box-shadow .06s; }
        .vh-key.on { background:#00e5ff; color:#000; border-color:#00e5ff; box-shadow:0 0 10px rgba(0,229,255,.7),0 0 20px rgba(0,229,255,.3); animation:vhKeyOn .1s ease forwards; }

        /* â”€â”€ MOUSE ROW â”€â”€ */
        .vh-mouse-row { display:flex; justify-content:center; align-items:center; gap:10px; }
        .vh-mouse-meta { display:flex; flex-direction:column; align-items:center; gap:3px; }
        .vh-mmeta-val  { font-size:22px; font-weight:bold; text-shadow:0 0 14px currentColor; }
        .vh-mmeta-lbl  { font-size:7px; letter-spacing:2px; color:rgba(255,255,255,.25); }

        /* â”€â”€ RESIZE HANDLE â”€â”€ */
        .vh-resize {
            position:absolute; bottom:0; right:0; width:14px; height:14px;
            cursor:se-resize; z-index:20;
            background:linear-gradient(135deg,transparent 50%,rgba(0,229,255,.4) 50%);
        }
        .vh-resize:hover { background:linear-gradient(135deg,transparent 50%,rgba(0,229,255,.8) 50%); }

        /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• SETTINGS GUI â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
        .vg-panel {
            position:fixed; z-index:999998; width:290px;
            font-family:'Courier New',Courier,monospace; font-size:11px;
            color:rgba(255,255,255,.7);
            background:linear-gradient(160deg,#060a12,#03060c);
            border:1px solid rgba(0,229,255,.3);
            box-shadow:0 0 0 1px #000,0 20px 60px rgba(0,0,0,.85),0 0 40px rgba(0,229,255,.07);
            display:none; overflow:hidden;
        }
        .vg-grid { position:absolute; inset:0; background-image:linear-gradient(rgba(0,229,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.03) 1px,transparent 1px); background-size:16px 16px; pointer-events:none; z-index:0; }
        .vg-c { position:absolute; width:9px; height:9px; pointer-events:none; z-index:5; }
        .vg-c.tl { top:-1px;    left:-1px;  border-top:2px solid rgba(0,229,255,.5); border-left:2px solid rgba(0,229,255,.5); }
        .vg-c.tr { top:-1px;    right:-1px; border-top:2px solid rgba(0,229,255,.5); border-right:2px solid rgba(0,229,255,.5); }
        .vg-c.bl { bottom:-1px; left:-1px;  border-bottom:2px solid rgba(0,229,255,.5); border-left:2px solid rgba(0,229,255,.5); }
        .vg-c.br { bottom:-1px; right:-1px; border-bottom:2px solid rgba(0,229,255,.5); border-right:2px solid rgba(0,229,255,.5); }

        .vg-header { display:flex; justify-content:space-between; align-items:center; padding:10px 14px 9px; background:linear-gradient(90deg,rgba(0,229,255,.1),rgba(0,229,255,.02)); border-bottom:1px solid rgba(0,229,255,.15); cursor:grab; position:relative; z-index:10; }
        .vg-header:active { cursor:grabbing; }
        .vg-title { font-size:11px; font-weight:bold; letter-spacing:3px; color:#00e5ff; text-shadow:0 0 10px #00e5ff; }
        .vg-hint  { font-size:8px; color:rgba(255,255,255,.18); letter-spacing:1px; }
        .vg-led   { display:inline-block; width:5px; height:5px; border-radius:50%; background:#00e5ff; box-shadow:0 0 6px #00e5ff; animation:vhBlink 1.2s ease infinite; vertical-align:middle; margin-left:3px; }

        /* TABS */
        .vg-tabs { display:flex; border-bottom:1px solid rgba(0,229,255,.12); position:relative; z-index:10; }
        .vg-tab  { flex:1; padding:7px 4px; text-align:center; font-size:9px; letter-spacing:1.5px; color:rgba(255,255,255,.3); cursor:pointer; border-bottom:2px solid transparent; transition:color .15s,border-color .15s; }
        .vg-tab:hover { color:rgba(255,255,255,.6); }
        .vg-tab.active { color:#00e5ff; border-bottom-color:#00e5ff; text-shadow:0 0 8px #00e5ff; }

        /* TAB PANE */
        .vg-pane { display:none; position:relative; z-index:2; max-height:420px; overflow-y:auto; }
        .vg-pane.active { display:block; }
        .vg-pane::-webkit-scrollbar { width:3px; }
        .vg-pane::-webkit-scrollbar-thumb { background:rgba(0,229,255,.3); }

        .vg-sec       { padding:10px 14px 8px; border-bottom:1px solid rgba(255,255,255,.05); }
        .vg-sec-title { font-size:8px; letter-spacing:2.5px; color:rgba(0,229,255,.4); font-weight:bold; text-transform:uppercase; margin-bottom:9px; display:flex; align-items:center; gap:6px; }
        .vg-sec-line  { flex:1; height:1px; background:linear-gradient(90deg,rgba(0,229,255,.25),transparent); }

        .vg-row       { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,.03); }
        .vg-row:last-child { border-bottom:none; }
        .vg-row label { color:rgba(255,255,255,.55); font-size:10px; cursor:pointer; }
        .vg-row span  { font-size:9px; color:rgba(0,229,255,.7); min-width:28px; text-align:right; }

        /* Color swatch pairs */
        .vg-swatch-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; padding:6px 0; }
        .vg-swatch { display:flex; flex-direction:column; gap:3px; }
        .vg-swatch label { font-size:9px; color:rgba(255,255,255,.4); letter-spacing:.5px; }
        .vg-swatch input[type=color] { width:100%; height:22px; border-radius:2px; border:1px solid rgba(255,255,255,.15); background:none; cursor:pointer; padding:1px; }

        /* Toggle */
        .vg-tog { position:relative; width:36px; height:19px; flex-shrink:0; }
        .vg-tog input { position:absolute; opacity:0; width:0; height:0; }
        .vg-track { position:absolute; inset:0; border-radius:10px; cursor:pointer; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.15); transition:background .2s,border-color .2s; }
        .vg-track::before { content:''; position:absolute; left:3px; top:3px; width:11px; height:11px; border-radius:50%; background:rgba(255,255,255,.45); transition:transform .2s,background .2s,box-shadow .2s; }
        .vg-tog input:checked + .vg-track { background:rgba(0,229,255,.22); border-color:rgba(0,229,255,.6); }
        .vg-tog input:checked + .vg-track::before { transform:translateX(17px); background:#00e5ff; box-shadow:0 0 8px #00e5ff; }

        input[type=color]  { background:none; border:1px solid rgba(255,255,255,.18); width:28px; height:20px; cursor:pointer; padding:1px; border-radius:2px; }
        input[type=range]  { width:110px; accent-color:#00e5ff; cursor:pointer; }

        .vg-footer { padding:7px 14px; text-align:center; font-size:8px; letter-spacing:1.5px; color:rgba(255,255,255,.15); }

        /* MOUSE PREVIEW (in settings) */
        .vg-mouse-preview { display:flex; justify-content:center; padding:10px 0 6px; }
    `;

    var hud, hudBody, statsEl, graphWrap, gCanvas, gCtx, keysEl, mouseRow, gui;


    function makeDrag(panel, handle) {
        var dragging = false, ox, oy, ol, ot;
        handle.style.touchAction = 'none';

        handle.addEventListener('pointerdown', function (e) {
            var tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'LABEL' || tag === 'BUTTON') return;
            e.preventDefault(); e.stopPropagation();
            var r = panel.getBoundingClientRect();
            ox = e.clientX; oy = e.clientY; ol = r.left; ot = r.top;
            panel.style.right  = 'auto';
            panel.style.bottom = 'auto';
            panel.style.left   = ol + 'px';
            panel.style.top    = ot + 'px';
            dragging = true;
            handle.setPointerCapture(e.pointerId);
            handle.style.cursor = 'grabbing';
        });

        handle.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            e.preventDefault(); e.stopPropagation();
            var nl = Math.max(0, Math.min(window.innerWidth  - 40, ol + e.clientX - ox));
            var nt = Math.max(0, Math.min(window.innerHeight - 20, ot + e.clientY - oy));
            panel.style.left = nl + 'px';
            panel.style.top  = nt + 'px';
            if (panel === hud) { state.hud.x = nl; state.hud.y = nt; save(); }
        });

        handle.addEventListener('pointerup', function (e) {
            if (!dragging) return;
            dragging = false;
            handle.releasePointerCapture(e.pointerId);
            handle.style.cursor = 'grab';
        });

        handle.addEventListener('pointercancel', function () {
            dragging = false;
            handle.style.cursor = 'grab';
        });

        ['mousedown','mouseup','mousemove','click','wheel','contextmenu'].forEach(function(ev) {
            panel.addEventListener(ev, function(e) {
                e.stopPropagation();
                if (ev === 'contextmenu' || ev === 'wheel') e.preventDefault();
            }, {passive: false});
        });
    }

    function makeResize(panel, handle) {
        var resizing = false, sx, sw;
        handle.style.touchAction = 'none';

        handle.addEventListener('pointerdown', function (e) {
            e.preventDefault(); e.stopPropagation();
            resizing = true; sx = e.clientX; sw = panel.offsetWidth;
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener('pointermove', function (e) {
            if (!resizing) return;
            e.preventDefault(); e.stopPropagation();
            var nw = Math.max(160, Math.min(600, sw + e.clientX - sx));
            panel.style.width = nw + 'px';
            state.hud.width = nw;
            if (gCanvas) gCanvas.width = Math.max(80, nw - 22);
            save();
        });

        handle.addEventListener('pointerup', function (e) {
            resizing = false;
            handle.releasePointerCapture(e.pointerId);
        });
    }

    function init() {
        var styleEl = document.createElement('style');
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);

        hud = document.createElement('div');
        hud.className = 'vh-panel' + (state.hud.chroma ? ' chroma' : '');
        hud.style.width = state.hud.width + 'px';
        if (state.hud.x !== null) {
            hud.style.left = state.hud.x + 'px';
            hud.style.top  = state.hud.y + 'px';
        } else {
            hud.style.top   = '20px';
            hud.style.right = '20px';
        }
        if (!state.hud.chroma) {
            hud.style.borderColor = state.hud.color;
            hud.style.boxShadow   = '0 0 0 1px #000,0 0 22px ' + state.hud.color + '40';
        }

        hud.innerHTML =
            '<div class="vh-scanline"></div><div class="vh-grid"></div>' +
            '<div class="vh-c tl"></div><div class="vh-c tr"></div>' +
            '<div class="vh-c bl"></div><div class="vh-c br"></div>';

        var header = document.createElement('div');
        header.className = 'vh-header';
        header.innerHTML =
            '<div class="vh-dots">' +
              '<div class="vh-dot" style="background:#ff5f57;box-shadow:0 0 6px #ff5f57;animation-delay:0s"></div>' +
              '<div class="vh-dot" style="background:#febc2e;box-shadow:0 0 6px #febc2e;animation-delay:.4s"></div>' +
              '<div class="vh-dot" style="background:#28c840;box-shadow:0 0 6px #28c840;animation-delay:.8s"></div>' +
            '</div>' +
            '<div class="vh-title">VHP&#9672;</div>' +
            '<div class="vh-tag" id="vh-settings-btn">&#9881; &#8679;R</div>';

        hudBody   = document.createElement('div'); hudBody.className = 'vh-body';
        statsEl   = document.createElement('div'); statsEl.className = 'vh-stats';
        graphWrap = document.createElement('div'); graphWrap.className = 'vh-graph-wrap';
        graphWrap.innerHTML = '<div class="vh-graph-lbl">FPS HISTORY</div>';

        gCanvas = document.createElement('canvas');
        gCanvas.width  = state.hud.width - 22;
        gCanvas.height = 32;
        gCtx = gCanvas.getContext('2d');
        graphWrap.appendChild(gCanvas);

        var sep1 = document.createElement('div'); sep1.className = 'vh-sep'; sep1.innerHTML = '<div class="vh-sep-ico">&#9672;</div>';
        keysEl   = document.createElement('div'); keysEl.className = 'vh-keys';
        var sep2 = document.createElement('div'); sep2.className = 'vh-sep'; sep2.innerHTML = '<div class="vh-sep-ico">&#9672;</div>';
        mouseRow = document.createElement('div'); mouseRow.className = 'vh-mouse-row';

        hudBody.appendChild(statsEl);
        hudBody.appendChild(graphWrap);
        hudBody.appendChild(sep1);
        hudBody.appendChild(keysEl);
        hudBody.appendChild(sep2);
        hudBody.appendChild(mouseRow);

        var resizeH = document.createElement('div'); resizeH.className = 'vh-resize';

        hud.appendChild(header);
        hud.appendChild(hudBody);
        hud.appendChild(resizeH);
        document.body.appendChild(hud);

        makeDrag(hud, header);
        makeResize(hud, resizeH);

        header.querySelector('#vh-settings-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            showMenu = !showMenu;
            if (showMenu) renderGui();
            else gui.style.display = 'none';
        });

        gui = document.createElement('div');
        gui.className = 'vg-panel';
        gui.style.top  = '130px';
        gui.style.left = '250px';
        document.body.appendChild(gui);

        setupEvents();
        loop();
    }

    function drawGraph() {
        var w = gCanvas.width, h = gCanvas.height;
        gCtx.clearRect(0, 0, w, h);
        var mx = Math.max.apply(null, fpsHist.concat([60]));

        gCtx.strokeStyle = 'rgba(0,229,255,0.07)'; gCtx.lineWidth = 1;
        [0.25, 0.5, 0.75].forEach(function (f) {
            gCtx.beginPath(); gCtx.moveTo(0, h * f); gCtx.lineTo(w, h * f); gCtx.stroke();
        });

        var g = gCtx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(0,229,255,0.22)'); g.addColorStop(1, 'rgba(0,229,255,0)');

        gCtx.beginPath();
        fpsHist.forEach(function (v, i) {
            var x = (i / (fpsHist.length - 1)) * w;
            var y = h - 2 - (v / mx) * (h - 6);
            i === 0 ? gCtx.moveTo(x, y) : gCtx.lineTo(x, y);
        });
        gCtx.lineTo(w, h); gCtx.lineTo(0, h); gCtx.closePath();
        gCtx.fillStyle = g; gCtx.fill();

        gCtx.beginPath();
        fpsHist.forEach(function (v, i) {
            var x = (i / (fpsHist.length - 1)) * w;
            var y = h - 2 - (v / mx) * (h - 6);
            i === 0 ? gCtx.moveTo(x, y) : gCtx.lineTo(x, y);
        });
        gCtx.strokeStyle = '#00e5ff'; gCtx.lineWidth = 1.5;
        gCtx.shadowColor = '#00e5ff'; gCtx.shadowBlur = 5;
        gCtx.stroke(); gCtx.shadowBlur = 0;

        var ly = h - 2 - (fpsHist[fpsHist.length - 1] / mx) * (h - 6);
        gCtx.beginPath(); gCtx.arc(w - 1, ly, 2.5, 0, Math.PI * 2);
        gCtx.fillStyle = '#00e5ff'; gCtx.shadowColor = '#00e5ff'; gCtx.shadowBlur = 8;
        gCtx.fill(); gCtx.shadowBlur = 0;
    }

    function fpsCol(f)  { return f >= 120 ? '#00ff9f' : f >= 60 ? '#00e5ff' : f >= 30 ? '#ffb700' : '#ff2d78'; }
    function pingCol(p) { return typeof p !== 'number' ? '#ff2d78' : p < 50 ? '#00ff9f' : p < 100 ? '#00e5ff' : p < 200 ? '#ffb700' : '#ff2d78'; }

    function hexGlow(hex, a) {
        var r = parseInt(hex.slice(1,3),16);
        var g = parseInt(hex.slice(3,5),16);
        var b = parseInt(hex.slice(5,7),16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function mouseSVG(preview) {
        var mc   = state.mouse;
        var lc   = !preview && keys['LMB'];
        var rc   = !preview && keys['RMB'];
        var wc   = !preview && keys['MMB'];
        var mb4  = !preview && keys['MB4'];
        var mb5  = !preview && keys['MB5'];
        var sd   = !preview && scrollDir;

        var lFill   = lc  ? mc.lmb   : mc.body;
        var rFill   = rc  ? mc.rmb   : mc.body;
        var wFill   = wc  ? mc.wheel : (sd ? mc.side : 'rgba(180,180,180,0.35)');
        var m4Fill  = mb4 ? mc.side  : mc.body;
        var m5Fill  = mb5 ? mc.side  : mc.body;
        var outline = mc.outline;
        var dimLine = 'rgba(255,255,255,0.18)';
        var lTxt    = mc.labels ? (lc ? '#000' : 'rgba(255,255,255,0.25)') : 'none';
        var rTxt    = mc.labels ? (rc ? '#000' : 'rgba(255,255,255,0.25)') : 'none';

        var lGlow   = lc  ? 'filter:drop-shadow(0 0 5px ' + hexGlow(mc.lmb, 0.9) + ')' : '';
        var rGlow   = rc  ? 'filter:drop-shadow(0 0 5px ' + hexGlow(mc.rmb, 0.9) + ')' : '';

        var wArrow  = sd > 0
            ? '<text x="55" y="34" text-anchor="middle" fill="rgba(0,0,0,0.7)" font-size="9" font-family="monospace">&#9650;</text>'
            : sd < 0
            ? '<text x="55" y="35" text-anchor="middle" fill="rgba(0,0,0,0.7)" font-size="9" font-family="monospace">&#9660;</text>'
            : '';

        var lRipple = (lc && mc.ripples)
            ? '<ellipse cx="34" cy="52" rx="14" ry="10" fill="none" stroke="' + hexGlow(mc.lmb, 0.4) + '" stroke-width="1.2"/>' +
              '<ellipse cx="34" cy="52" rx="22" ry="16" fill="none" stroke="' + hexGlow(mc.lmb, 0.15) + '" stroke-width="0.8"/>'
            : '';
        var rRipple = (rc && mc.ripples)
            ? '<ellipse cx="76" cy="52" rx="14" ry="10" fill="none" stroke="' + hexGlow(mc.rmb, 0.4) + '" stroke-width="1.2"/>' +
              '<ellipse cx="76" cy="52" rx="22" ry="16" fill="none" stroke="' + hexGlow(mc.rmb, 0.15) + '" stroke-width="0.8"/>'
            : '';

        var sc    = preview ? 0.85 : (mc.scale || 1.0);
        var w     = Math.round(78 * sc), h = Math.round(101 * sc);

        var bodyPath =
            'M 24,4 Q 16,4 16,12 L 16,58 C 13,68 11,78 13,90 C 11,104 14,118 20,130 ' +
            'Q 30,144 55,148 Q 80,144 90,130 C 96,118 99,104 97,90 ' +
            'C 99,78 97,68 94,58 L 94,12 Q 94,4 86,4 Z';

        return (
            '<svg viewBox="0 0 120 155" xmlns="http://www.w3.org/2000/svg"' +
            ' width="' + w + '" height="' + h + '" style="overflow:visible">' +

            '<defs>' +
              '<linearGradient id="mbg14" x1="0" y1="0" x2="0" y2="1">' +
                '<stop offset="0%" stop-color="' + mc.body + '"/>' +
                '<stop offset="100%" stop-color="#030608"/>' +
              '</linearGradient>' +
              '<clipPath id="mbc14"><path d="' + bodyPath + '"/></clipPath>' +
            '</defs>' +

            '<path d="' + bodyPath + '" fill="url(#mbg14)"/>' +

            '<path d="M 16,4 L 55,4 L 55,58 L 16,58 Z" fill="' + lFill + '"' +
              ' clip-path="url(#mbc14)"' + (lGlow ? ' style="' + lGlow + '"' : '') + '/>' +

            '<path d="M 55,4 L 94,4 L 94,58 L 55,58 Z" fill="' + rFill + '"' +
              ' clip-path="url(#mbc14)"' + (rGlow ? ' style="' + rGlow + '"' : '') + '/>' +
            '<line x1="55" y1="4"  x2="55" y2="58" stroke="' + dimLine + '" stroke-width="1.2"/>' +
            '<line x1="16" y1="58" x2="94" y2="58" stroke="' + dimLine + '" stroke-width="1"/>' +
            '<path d="' + bodyPath + '" fill="none" stroke="' + outline + '" stroke-width="1.8" stroke-linejoin="round"/>' +
            '<ellipse cx="55" cy="30" rx="10" ry="18" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/>' +
            '<ellipse cx="55" cy="30" rx="7.5" ry="15" fill="' + wFill + '"/>' +
            '<line x1="47.5" y1="22" x2="62.5" y2="22" stroke="rgba(0,0,0,0.4)" stroke-width="1.2"/>' +
            '<line x1="47.5" y1="26" x2="62.5" y2="26" stroke="rgba(0,0,0,0.4)" stroke-width="1.2"/>' +
            '<line x1="47.5" y1="30" x2="62.5" y2="30" stroke="rgba(0,0,0,0.4)" stroke-width="1.2"/>' +
            '<line x1="47.5" y1="34" x2="62.5" y2="34" stroke="rgba(0,0,0,0.4)" stroke-width="1.2"/>' +
            '<line x1="47.5" y1="38" x2="62.5" y2="38" stroke="rgba(0,0,0,0.4)" stroke-width="1.2"/>' +
            wArrow +
            '<path d="M 16,64 L 8,64 Q 5,64 5,68 L 5,82 Q 5,86 8,86 L 16,86 Z" fill="' + m4Fill + '" stroke="' + outline + '" stroke-width="1.4" stroke-linejoin="round"/>' +
            '<path d="M 16,90 L 8,90 Q 5,90 5,94 L 5,108 Q 5,112 8,112 L 16,112 Z" fill="' + m5Fill + '" stroke="' + outline + '" stroke-width="1.4" stroke-linejoin="round"/>' +
            (mc.labels ? (
              '<text x="34" y="55" text-anchor="middle" fill="' + lTxt + '" font-size="8" font-family="Courier New,monospace" font-weight="bold">LMB</text>' +
              '<text x="76" y="55" text-anchor="middle" fill="' + rTxt + '" font-size="8" font-family="Courier New,monospace" font-weight="bold">RMB</text>'
            ) : '') +

            lRipple + rRipple +
            '<circle cx="55" cy="138" r="4.5" fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/>' +
            '<circle cx="55" cy="138" r="1.8" fill="rgba(255,45,120,0.7)"/>' +

            '</svg>'
        );
    }
    function K(code, label, span) {
        var h = state.layout.keyH;
        return '<div class="vh-key' + (keys[code] ? ' on' : '') +
               '" style="grid-column:span ' + (span || 1) + ';height:' + h + 'px">' + label + '</div>';
    }
    function render() {
        var now = performance.now();
        while (clicks.length && clicks[0] < now - 1000) clicks.shift();
        fps = Math.round(1000 / (now - lastT)); lastT = now;
        fpsHist.push(fps); fpsHist.shift();

        var p = state.layout.padding + 'px ' + state.layout.padding + 'px ' + (state.layout.padding + 1) + 'px';
        hudBody.style.padding = p;
        hudBody.style.gap = state.layout.gap + 'px';
        keysEl.style.gap  = state.layout.gap + 'px';

        var parts = [];
        if (state.modules.fps)
            parts.push('<div class="vh-sbox"><div class="vh-slbl">FPS</div><div class="vh-sval" style="color:' + fpsCol(fps) + '">' + fps + '</div></div>');
        if (state.modules.ping)
            parts.push('<div class="vh-sbox"><div class="vh-slbl">PING</div><div class="vh-sval" style="color:' + pingCol(ping) + '">' + ping + '</div><div class="vh-sunit">' + (typeof ping === 'number' ? 'ms' : '') + '</div></div>');
        if (state.modules.cps)
            parts.push('<div class="vh-sbox"><div class="vh-slbl">CPS</div><div class="vh-sval" style="color:#ff2d78">' + clicks.length + '</div></div>');

        var showStats = state.modules.fps || state.modules.ping || state.modules.cps;
        statsEl.style.display = showStats ? 'grid' : 'none';
        if (showStats) statsEl.innerHTML = parts.join('');

        var showGraph = state.modules.fps && state.modules.graph;
        graphWrap.style.display = showGraph ? 'block' : 'none';
        if (showGraph) { gCanvas.width = hud.offsetWidth - 22; drawGraph(); }

        keysEl.style.display = state.modules.keys ? 'grid' : 'none';
        if (state.modules.keys) {
            keysEl.innerHTML =
                '<div style="grid-column:span 2"></div>' + K('KeyW','W',2) + '<div style="grid-column:span 2"></div>' +
                K('KeyA','A',2) + K('KeyS','S',2) + K('KeyD','D',2) +
                K('LMB','LMB',3) + K('RMB','RMB',3) +
                K('Space','SPACE',6) +
                K('ShiftLeft','SHIFT',3) + K('KeyC','C',3);
        }

        mouseRow.style.display = state.modules.mouse ? 'flex' : 'none';
        if (state.modules.mouse) {
            mouseRow.innerHTML =
                mouseSVG(false) +
                '<div class="vh-mouse-meta">' +
                  '<div class="vh-mmeta-val" style="color:' + state.mouse.lmb + '">' + clicks.length + '</div>' +
                  '<div class="vh-mmeta-lbl">CPS</div>' +
                '</div>';
        }
    }

    function loop() {
        hud.style.display = state.hud.visible ? 'block' : 'none';
        if (state.hud.visible) {
            hud.style.background = 'linear-gradient(160deg,rgba(6,14,22,' + state.hud.opacity + '),rgba(3,7,13,' + state.hud.opacity + '))';
            render();
        }
        requestAnimationFrame(loop);
    }

    function tog(id, checked, label) {
        return '<div class="vg-row"><label for="' + id + '">' + label + '</label>' +
               '<label class="vg-tog"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>' +
               '<div class="vg-track"></div></label></div>';
    }
    function sliderRow(id, label, min, max, step, val, unit) {
        return '<div class="vg-row"><label>' + label + '</label>' +
               '<span id="' + id + '-disp">' + val + (unit||'') + '</span>' +
               '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>';
    }
    function colorRow(id, label, val) {
        return '<div class="vg-row"><label for="' + id + '">' + label + '</label><input type="color" id="' + id + '" value="' + val + '"></div>';
    }

    function renderGui() {
        var tabs = ['HUD','MOUSE','LAYOUT'];
        var tabHtml = '<div class="vg-tabs">' + tabs.map(function(t) {
            var k = t.toLowerCase();
            return '<div class="vg-tab' + (activeTab === k ? ' active' : '') + '" data-tab="' + k + '">' + t + '</div>';
        }).join('') + '</div>';

        var hudPane =
            '<div class="vg-pane' + (activeTab === 'hud' ? ' active' : '') + '" id="vg-pane-hud">' +
              '<div class="vg-sec">' +
                '<div class="vg-sec-title">Appearance <div class="vg-sec-line"></div></div>' +
                colorRow('vg-col', 'Accent Color', state.hud.color) +
                tog('vg-chroma', state.hud.chroma, 'Chroma RGB') +
                sliderRow('vg-op', 'Opacity', 0.3, 1, 0.05, state.hud.opacity, '') +
                tog('vg-vis', state.hud.visible, 'HUD Visible') +
              '</div>' +
              '<div class="vg-sec">' +
                '<div class="vg-sec-title">Modules <div class="vg-sec-line"></div></div>' +
                tog('vm-fps',   state.modules.fps,   'FPS Counter') +
                tog('vm-graph', state.modules.graph, 'FPS Graph') +
                tog('vm-ping',  state.modules.ping,  'Ping') +
                tog('vm-cps',   state.modules.cps,   'CPS') +
                tog('vm-keys',  state.modules.keys,  'Keystrokes') +
                tog('vm-mouse', state.modules.mouse, 'Mouse UI') +
              '</div>' +
            '</div>';

        var mousePane =
            '<div class="vg-pane' + (activeTab === 'mouse' ? ' active' : '') + '" id="vg-pane-mouse">' +
              '<div class="vg-sec">' +
                '<div class="vg-sec-title">Button Colors <div class="vg-sec-line"></div></div>' +
                '<div class="vg-swatch-grid">' +
                  '<div class="vg-swatch"><label>LMB</label><input type="color" id="mc-lmb" value="' + state.mouse.lmb + '"></div>' +
                  '<div class="vg-swatch"><label>RMB</label><input type="color" id="mc-rmb" value="' + state.mouse.rmb + '"></div>' +
                  '<div class="vg-swatch"><label>Scroll Wheel</label><input type="color" id="mc-wheel" value="' + state.mouse.wheel + '"></div>' +
                  '<div class="vg-swatch"><label>Side Buttons</label><input type="color" id="mc-side" value="' + state.mouse.side + '"></div>' +
                  '<div class="vg-swatch"><label>Body</label><input type="color" id="mc-body" value="' + state.mouse.body + '"></div>' +
                  '<div class="vg-swatch"><label>Outline</label><input type="color" id="mc-outline" value="' + state.mouse.outline + '"></div>' +
                '</div>' +
              '</div>' +
              '<div class="vg-sec">' +
                '<div class="vg-sec-title">Options <div class="vg-sec-line"></div></div>' +
                tog('mc-labels',  state.mouse.labels,  'Show LMB/RMB Labels') +
                tog('mc-ripples', state.mouse.ripples, 'Click Ripples') +
                sliderRow('mc-scale', 'Mouse Size', 0.5, 2.0, 0.1, state.mouse.scale, 'x') +
              '</div>' +
              '<div class="vg-sec">' +
                '<div class="vg-sec-title">Preview <div class="vg-sec-line"></div></div>' +
                '<div class="vg-mouse-preview" id="vg-mouse-preview">' + mouseSVG(true) + '</div>' +
              '</div>' +
            '</div>';

        var curX = Math.round(state.hud.x !== null ? state.hud.x : (window.innerWidth - state.hud.width - 20));
        var curY = Math.round(state.hud.y !== null ? state.hud.y : 20);
        var layoutPane =
            '<div class="vg-pane' + (activeTab === 'layout' ? ' active' : '') + '" id="vg-pane-layout">' +

              '<div class="vg-sec">' +
                '<div class="vg-sec-title">Position <div class="vg-sec-line"></div></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px 0">' +
                  '<div>' +
                    '<div style="font-size:9px;color:rgba(0,229,255,0.5);letter-spacing:1px;margin-bottom:4px">X  (left)</div>' +
                    '<input type="number" id="ly-px" min="0" max="3840" step="1" value="' + curX + '" style="width:100%;background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.3);color:#00e5ff;font-family:Courier New;font-size:15px;font-weight:bold;padding:6px 8px;outline:none;box-sizing:border-box">' +
                  '</div>' +
                  '<div>' +
                    '<div style="font-size:9px;color:rgba(0,229,255,0.5);letter-spacing:1px;margin-bottom:4px">Y  (top)</div>' +
                    '<input type="number" id="ly-py" min="0" max="2160" step="1" value="' + curY + '" style="width:100%;background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.3);color:#00e5ff;font-family:Courier New;font-size:15px;font-weight:bold;padding:6px 8px;outline:none;box-sizing:border-box">' +
                  '</div>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:6px 0 2px">' +
                  '<button id="ly-snap-tl" style="font-family:Courier New;font-size:9px;letter-spacing:1px;background:rgba(0,229,255,0.07);color:rgba(0,229,255,0.6);border:1px solid rgba(0,229,255,0.2);padding:5px 2px;cursor:pointer">TOP LEFT</button>' +
                  '<button id="ly-snap-tr" style="font-family:Courier New;font-size:9px;letter-spacing:1px;background:rgba(0,229,255,0.07);color:rgba(0,229,255,0.6);border:1px solid rgba(0,229,255,0.2);padding:5px 2px;cursor:pointer">TOP RIGHT</button>' +
                  '<button id="ly-snap-bl" style="font-family:Courier New;font-size:9px;letter-spacing:1px;background:rgba(0,229,255,0.07);color:rgba(0,229,255,0.6);border:1px solid rgba(0,229,255,0.2);padding:5px 2px;cursor:pointer">BOT LEFT</button>' +
                  '<button id="ly-snap-br" style="font-family:Courier New;font-size:9px;letter-spacing:1px;background:rgba(0,229,255,0.07);color:rgba(0,229,255,0.6);border:1px solid rgba(0,229,255,0.2);padding:5px 2px;cursor:pointer">BOT RIGHT</button>' +
                '</div>' +
              '</div>' +

              '<div class="vg-sec">' +
                '<div class="vg-sec-title">HUD Size <div class="vg-sec-line"></div></div>' +
                sliderRow('ly-width', 'Width',       160, 480, 5, state.hud.width,      'px') +
                sliderRow('ly-pad',   'Padding',     4,   20,  1, state.layout.padding, 'px') +
                sliderRow('ly-gap',   'Section Gap', 2,   12,  1, state.layout.gap,     'px') +
              '</div>' +
              '<div class="vg-sec">' +
                '<div class="vg-sec-title">Keys <div class="vg-sec-line"></div></div>' +
                sliderRow('ly-keyh', 'Key Height', 18, 52, 1, state.layout.keyH, 'px') +
              '</div>' +
              '<div class="vg-sec">' +
                '<div class="vg-sec-title">Reset <div class="vg-sec-line"></div></div>' +
                '<div class="vg-row"><label>Reset all settings</label><button id="vg-reset" style="font-family:Courier New;font-size:10px;background:rgba(255,45,120,.15);color:#ff2d78;border:1px solid rgba(255,45,120,.4);padding:3px 10px;cursor:pointer;">RESET</button></div>' +
              '</div>' +
            '</div>';

        gui.innerHTML =
            '<div class="vg-grid"></div>' +
            '<div class="vg-c tl"></div><div class="vg-c tr"></div>' +
            '<div class="vg-c bl"></div><div class="vg-c br"></div>' +
            '<div class="vg-header" id="vg-hdl">' +
              '<div class="vg-title">&#9672; SETTINGS</div>' +
              '<div class="vg-hint">&#8679;R CLOSE <span class="vg-led"></span></div>' +
            '</div>' +
            tabHtml + hudPane + mousePane + layoutPane +
            '<div class="vg-footer" style="position:relative;z-index:2">AUTO-SAVED &bull; &#8679;R or &#9881; TOGGLE</div>';

        makeDrag(gui, gui.querySelector('#vg-hdl'));

        gui.querySelectorAll('.vg-tab').forEach(function (t) {
            t.addEventListener('click', function () {
                activeTab = this.dataset.tab;
                gui.querySelectorAll('.vg-tab').forEach(function (x) { x.classList.remove('active'); });
                gui.querySelectorAll('.vg-pane').forEach(function (x) { x.classList.remove('active'); });
                this.classList.add('active');
                var pane = gui.querySelector('#vg-pane-' + activeTab);
                if (pane) pane.classList.add('active');
            });
        });

        gui.querySelector('#vg-col').oninput = function (e) {
            state.hud.color = e.target.value; state.hud.chroma = false;
            var cb = gui.querySelector('#vg-chroma'); if (cb) cb.checked = false;
            hud.classList.remove('chroma');
            hud.style.borderColor = e.target.value;
            hud.style.boxShadow   = '0 0 0 1px #000,0 0 22px ' + e.target.value + '40';
            save();
        };
        gui.querySelector('#vg-chroma').onchange = function (e) {
            state.hud.chroma = e.target.checked;
            if (state.hud.chroma) { hud.classList.add('chroma'); hud.style.borderColor = ''; hud.style.boxShadow = ''; }
            else { hud.classList.remove('chroma'); hud.style.borderColor = state.hud.color; hud.style.boxShadow = '0 0 0 1px #000,0 0 22px ' + state.hud.color + '40'; }
            save();
        };
        bindSlider('vg-op', function (v) { state.hud.opacity = +v; save(); });
        gui.querySelector('#vg-vis').onchange = function (e) { state.hud.visible = e.target.checked; save(); };
        gui.querySelectorAll('[id^="vm-"]').forEach(function (cb) {
            cb.onchange = function (e) { state.modules[e.target.id.slice(3)] = e.target.checked; save(); };
        });

        function mcColor(id, key) {
            var el = gui.querySelector('#' + id); if (!el) return;
            el.oninput = function (e) { state.mouse[key] = e.target.value; refreshPreview(); save(); };
        }
        mcColor('mc-lmb',     'lmb');
        mcColor('mc-rmb',     'rmb');
        mcColor('mc-wheel',   'wheel');
        mcColor('mc-side',    'side');
        mcColor('mc-body',    'body');
        mcColor('mc-outline', 'outline');

        gui.querySelector('#mc-labels').onchange  = function (e) { state.mouse.labels  = e.target.checked; refreshPreview(); save(); };
        gui.querySelector('#mc-ripples').onchange = function (e) { state.mouse.ripples = e.target.checked; save(); };
        bindSlider('mc-scale', function (v) { state.mouse.scale = +v; refreshPreview(); save(); }, 'x');

        bindSlider('ly-width', function (v) {
            state.hud.width = +v; hud.style.width = v + 'px';
            gCanvas.width = hud.offsetWidth - 22; save();
        }, 'px');
        bindSlider('ly-pad',   function (v) { state.layout.padding = +v; save(); }, 'px');
        bindSlider('ly-gap',   function (v) { state.layout.gap = +v;     save(); }, 'px');
        bindSlider('ly-keyh',  function (v) { state.layout.keyH = +v;    save(); }, 'px');

        function applyPos(x, y) {
            x = Math.max(0, Math.min(window.innerWidth  - 40, Math.round(x)));
            y = Math.max(0, Math.min(window.innerHeight - 20, Math.round(y)));
            hud.style.right  = 'auto';
            hud.style.bottom = 'auto';
            hud.style.left   = x + 'px';
            hud.style.top    = y + 'px';
            state.hud.x = x; state.hud.y = y; save();
            var px = gui.querySelector('#ly-px'); if (px) px.value = x;
            var py = gui.querySelector('#ly-py'); if (py) py.value = y;
        }

        var pxEl = gui.querySelector('#ly-px');
        var pyEl = gui.querySelector('#ly-py');
        if (pxEl) pxEl.oninput = function () { applyPos(+this.value, state.hud.y !== null ? state.hud.y : 20); };
        if (pyEl) pyEl.oninput = function () { applyPos(state.hud.x !== null ? state.hud.x : 20, +this.value); };

        function snapBtn(id, xFn, yFn) {
            var b = gui.querySelector(id);
            if (!b) return;
            b.onclick = function () { applyPos(xFn(), yFn()); };
        }
        snapBtn('#ly-snap-tl', function(){ return 20; },                                         function(){ return 20; });
        snapBtn('#ly-snap-tr', function(){ return window.innerWidth - state.hud.width - 20; },   function(){ return 20; });
        snapBtn('#ly-snap-bl', function(){ return 20; },                                         function(){ return window.innerHeight - hud.offsetHeight - 20; });
        snapBtn('#ly-snap-br', function(){ return window.innerWidth - state.hud.width - 20; },   function(){ return window.innerHeight - hud.offsetHeight - 20; });

        gui.querySelector('#vg-reset').onclick = function () {
            if (!confirm('Reset ALL settings to default?')) return;
            localStorage.removeItem('vhp15');
            location.reload();
        };

        gui.style.display = 'block';
    }

    function bindSlider(id, cb, unit) {
        var el   = gui.querySelector('#' + id);
        var disp = gui.querySelector('#' + id + '-disp');
        if (!el) return;
        el.oninput = function (e) {
            if (disp) disp.textContent = e.target.value + (unit || '');
            cb(e.target.value);
        };
    }

    function refreshPreview() {
        var p = gui.querySelector('#vg-mouse-preview');
        if (p) p.innerHTML = mouseSVG(true);
    }

    function setupEvents() {
        window.addEventListener('keydown', function (e) {
            if (e.code === 'ShiftRight') {
                showMenu = !showMenu;
                if (showMenu) renderGui();
                else { gui.style.display = 'none'; }
            }
            keys[e.code] = true;
        });
        window.addEventListener('keyup', function (e) { keys[e.code] = false; });

        window.addEventListener('mousedown', function (e) {
            var map = { 0:'LMB', 1:'MMB', 2:'RMB', 3:'MB4', 4:'MB5' };
            var b = map[e.button]; if (!b) return;
            keys[b] = true;
            if (b === 'LMB') clicks.push(performance.now());
        });
        window.addEventListener('mouseup', function (e) {
            var map = { 0:'LMB', 1:'MMB', 2:'RMB', 3:'MB4', 4:'MB5' };
            var b = map[e.button]; if (b) keys[b] = false;
        });

        window.addEventListener('wheel', function (e) {
            scrollDir = e.deltaY < 0 ? 1 : -1;
            clearTimeout(scrollTO);
            scrollTO = setTimeout(function () { scrollDir = 0; }, 400);
        }, { passive: true });

        setInterval(function () {
            var t = performance.now();
            fetch(location.origin + '/?_vh=' + t, { method:'HEAD', mode:'no-cors' })
                .then(function () { ping = Math.round(performance.now() - t); })
                .catch(function () { ping = 'ERR'; });
        }, 3000);
    }

    var boot = setInterval(function () {
        if (document.body) { clearInterval(boot); setTimeout(init, 500); }
    }, 200);

})();
