/* Meldline — UI, host logic and peer-to-peer networking. */
(function () {
  const L = window.Logic, $ = s => document.querySelector(s);
  const CW = 46, CH = 62, PREFIX = 'meldline-v1-';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let S = null, me = -1, isHost = false, seq = 0, rackOrder = [], snapSet = new Set(), deadline = 0;
  let view = { x: 0, y: 0, s: 1 }, drag = null, ghost = null, rackGeo = { cols: 1, tw: 40, th: 55, gap: 5, pad: 7 };
  const tiles = new Map();
  let sortMode = 'run', manual = false, roomCode = '';
  /* animation bookkeeping */
  let R = null; // what the last render showed: { turn, counts, pool }
  const flying = new Set(), dropFrom = new Map(), flights = [];
  const noAnim = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- small helpers ---------- */
  let toastT;
  function toast(text, sticky) {
    const t = $('#toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toastT); if (!sticky) toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function show(id) { ['menu', 'lobby', 'game'].forEach(s => $('#' + s).classList.toggle('hidden', s !== id)); }
  function myName() {
    const n = ($('#name').value || '').trim() || 'Player';
    try { localStorage.setItem('meldline-name', n); } catch (e) {}
    return n;
  }
  function roomUrl(code) { const u = new URL(location.href); u.searchParams.set('room', code); return u.href; }
  let myAv = Avatar.random();
  try { const a = JSON.parse(localStorage.getItem('meldline-avatar')); if (a) myAv = Avatar.clean(a); } catch (e) {}
  const BOTS = [['Juniper', { kind: 2, col: 0, bg: 2, acc: 1 }], ['Bram', { kind: 1, col: 3, bg: 3, acc: 3 }], ['Odette', { kind: 3, col: 5, bg: 4, acc: 4 }]];
  function renderAvEditor() {
    $('#avPrev').innerHTML = Avatar.svg(myAv);
    $('#avCard [data-k=kind] span').textContent = Avatar.KINDS[myAv.kind];
    $('#avCard [data-k=acc] span').textContent = Avatar.ACCS[myAv.acc] === 'None' ? 'No extra' : Avatar.ACCS[myAv.acc];
    try { localStorage.setItem('meldline-avatar', JSON.stringify(myAv)); } catch (e) {}
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- host (authoritative game state lives here) ---------- */
  const Host = {
    seats: [], g: null, code: '', password: '', timerSec: 0, tmo: null, botTmo: null, deadline: 0,
    toSeat(i, m) {
      const s = this.seats[i];
      if (!s || s.bot) return;
      if (s.local) { const c = JSON.parse(JSON.stringify(m)); setTimeout(() => Client.onMsg(c), 0); }
      else if (s.conn && s.conn.open) s.conn.send(m);
    },
    sendLobby() {
      const players = this.seats.map(s => ({ name: s.name, bot: !!s.bot, av: s.av }));
      this.seats.forEach((s, i) => this.toSeat(i, { t: 'lobby', code: this.code, players, you: i, locked: !!this.password }));
    },
    broadcastState() {
      const g = this.g;
      this.seats.forEach((s, i) => {
        const v = L.view(g, i);
        v.players.forEach((p, k) => { const q = this.seats[k]; p.off = !q.bot && !q.local && !q.connected; p.av = q.av; });
        this.toSeat(i, Object.assign(v, { t: 'state', ack: s.ack || 0, remain: this.deadline ? this.deadline - Date.now() : 0 }));
      });
    },
    relay(from, m) { this.seats.forEach((s, i) => { if (i !== from) this.toSeat(i, m); }); },
    start() {
      this.g = L.newGame(this.seats.map(s => ({ name: s.name, bot: s.bot })));
      this.seats.forEach(s => (s.ack = 0));
      this.turnChanged();
    },
    turnChanged() {
      clearTimeout(this.tmo); clearTimeout(this.botTmo);
      const g = this.g;
      this.deadline = g.winner == null && this.timerSec ? Date.now() + this.timerSec * 1000 : 0;
      this.broadcastState();
      if (g.winner != null) return;
      const seat = this.seats[g.turn], auto = () => { L.draw(g, g.turn); this.relay(-1, { t: 'dragend' }); this.turnChanged(); };
      if (seat.bot) this.botTmo = setTimeout(() => { L.botTurn(g); this.turnChanged(); }, 1100);
      else if (!seat.local && !seat.connected) this.botTmo = setTimeout(auto, 1500);
      if (this.timerSec) this.tmo = setTimeout(auto, this.timerSec * 1000);
    },
    onMsg(i, m) {
      const g = this.g; if (!g || !m) return;
      let r;
      switch (m.t) {
        case 'move': r = L.move(g, i, m.id, m.to); this.seats[i].ack = m.seq; this.broadcastState(); break;
        case 'reset': r = L.reset(g, i); this.seats[i].ack = m.seq; this.broadcastState(); break;
        case 'end': r = L.endTurn(g, i); if (r.ok) this.turnChanged(); break;
        case 'draw': r = L.draw(g, i); if (r.ok) this.turnChanged(); break;
        case 'drag':
          if (i !== g.turn) return;
          this.relay(i, { t: 'drag', id: m.id in g.board ? m.id : -1, x: +m.x, y: +m.y }); break;
        case 'dragend': if (i === g.turn) this.relay(i, { t: 'dragend' }); break;
      }
      if (r && !r.ok) this.toSeat(i, { t: 'err', text: r.err });
    },
    onConn(c) {
      c.on('data', m => {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'join') {
          if (this.password && m.pw !== this.password) { // private table: ask (again), give up after a few wrong tries
            c.tries = (c.tries || 0) + 1;
            if (c.tries > 6) { c.send({ t: 'err', text: 'Too many wrong passwords' }); return setTimeout(() => c.close(), 200); }
            return c.send({ t: 'needpw', wrong: typeof m.pw === 'string' && m.pw !== '' });
          }
          let name = String(m.name || 'Player').slice(0, 12);
          if (this.g) {
            const s = this.seats.find(s => !s.bot && !s.local && !s.connected && s.name === name);
            if (!s) return c.send({ t: 'err', text: 'That game is already in progress' });
            s.conn = c; s.connected = true; s.av = Avatar.clean(m.av); this.broadcastState();
          } else {
            if (this.seats.length >= 4) return c.send({ t: 'err', text: 'Table is full' });
            for (let k = 2; this.seats.some(s => s.name === name); k++) name = name.slice(0, 10) + ' ' + k;
            this.seats.push({ name, conn: c, connected: true, av: Avatar.clean(m.av) }); this.sendLobby();
          }
          return;
        }
        const i = this.seats.findIndex(s => s.conn === c);
        if (i >= 0) this.onMsg(i, m);
      });
      c.on('close', () => {
        const i = this.seats.findIndex(s => s.conn === c);
        if (i < 0) return;
        if (!this.g) { this.seats.splice(i, 1); this.sendLobby(); return; }
        this.seats[i].connected = false; this.seats[i].conn = null;
        if (this.g.winner == null && this.g.turn === i) { L.reset(this.g, i); this.turnChanged(); } else this.broadcastState();
      });
    },
  };

  /* ---------- network ---------- */
  const Net = {
    peer: null, conn: null,
    send(m) { if (isHost) Host.onMsg(0, m); else if (this.conn && this.conn.open) this.conn.send(m); },
  };
  function peerOpts() {
    // optional self-hosted signalling server: ?signal=host:port
    const sig = new URLSearchParams(location.search).get('signal');
    if (!sig) return { debug: 1 };
    const [host, port] = sig.split(':');
    return { debug: 1, host, port: +port || 443, path: '/', secure: location.protocol === 'https:' };
  }
  function hostOnline() {
    if (!window.Peer) return toast('Networking library failed to load');
    isHost = true; Host.g = null; Host.seats = [{ name: myName(), local: true, av: myAv }];
    Host.password = $('#roomPw').value.trim();
    toast('Opening table…', true);
    const open = () => {
      const code = Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join('');
      const peer = new Peer(PREFIX + code, peerOpts());
      peer.on('open', () => { Net.peer = peer; Host.code = code; Host.timerSec = +$('#timerSel').value; $('#toast').classList.remove('show'); Host.sendLobby(); });
      peer.on('connection', c => Host.onConn(c));
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
      peer.on('error', e => { if (e.type === 'unavailable-id') { peer.destroy(); open(); } else if (e.type !== 'peer-unavailable') toast('Network problem: ' + e.type); });
    };
    open();
  }
  function joinOnline(code) {
    if (!window.Peer) return toast('Networking library failed to load');
    code = code.trim().toUpperCase();
    if (code.length < 5) return toast('Enter the 5-letter table code');
    isHost = false; toast('Joining ' + code + '…', true);
    const peer = new Peer(peerOpts()); Net.peer = peer;
    peer.on('open', () => {
      const c = peer.connect(PREFIX + code, { reliable: true }); Net.conn = c;
      c.on('open', () => { $('#toast').classList.remove('show'); c.send({ t: 'join', name: myName(), av: myAv }); });
      c.on('data', m => Client.onMsg(m));
      c.on('close', () => toast('Lost connection to the host. Reload to rejoin.', true));
    });
    peer.on('error', e => toast(e.type === 'peer-unavailable' ? 'No table with that code' : 'Network problem: ' + e.type));
  }
  function playSolo() {
    isHost = true; Host.timerSec = 0; Host.code = ''; Host.password = ''; roomCode = '';
    Host.seats = [{ name: myName(), local: true, av: myAv }];
    for (let i = 0; i < +$('#botn').value; i++) Host.seats.push({ name: BOTS[i][0], av: BOTS[i][1], bot: true });
    Host.start();
  }

  /* ---------- client ---------- */
  const Client = {
    onMsg(m) {
      if (!m) return;
      if (m.t === 'lobby') return renderLobby(m);
      if (m.t === 'err') { shake(); return toast(m.text); }
      if (m.t === 'needpw') {
        $('#toast').classList.remove('show'); $('#pwModal').classList.remove('hidden');
        $('#pwMsg').textContent = m.wrong ? 'Wrong password. Try again.' : 'This table needs a password.';
        $('#pwInput').value = ''; $('#pwInput').focus(); return;
      }
      if (m.t === 'drag') return showGhost(m);
      if (m.t === 'dragend') return clearGhost();
      if (m.t === 'state') {
        if (S && m.turn === m.you && m.winner == null && m.ack < seq) return; // stale echo of my own moves
        const first = !S || $('#game').classList.contains('hidden'), prevTurn = S ? S.turn : -1;
        S = m; me = m.you; snapSet = new Set(m.snap);
        deadline = m.remain > 0 ? Date.now() + m.remain : 0;
        rackOrder = rackOrder.filter(id => id === null || S.rack.includes(id));
        let fresh = false;
        S.rack.forEach(id => { if (!rackOrder.includes(id)) { rackOrder.push(id); fresh = true; } });
        if (fresh && !manual && !first) sortRack(); else normalizeRack();
        if (first) { show('game'); $('#world').style.width = S.W * CW + 'px'; $('#world').style.height = S.H * CH + 'px'; sortRack('run'); fit(); }
        if (prevTurn !== S.turn) { clearGhost(); if (S.turn === me && S.winner == null && !first) toast('Your turn'); }
        render();
        $('#over').classList.toggle('hidden', S.winner == null);
        if (S.winner != null) renderOver();
      }
    },
  };
  function shake() {
    if (noAnim) return;
    const els = [...document.querySelectorAll('#world .tile.bad')]; if (!els.length) els.push($('#status'));
    els.forEach(el => el.animate([0, -5, 5, -4, 4, -2, 0].map(x => ({ transform: `translateX(${x}px)` })), { duration: 380, easing: 'ease-out' }));
  }
  function sendSeq(m) { m.seq = ++seq; Net.send(m); }

  /* ---------- lobby ---------- */
  function renderLobby(m) {
    show('lobby'); S = null; R = null; roomCode = m.code; $('#pwModal').classList.add('hidden');
    $('#lobbyCode').textContent = m.code;
    $('#lobbyHint').textContent = (m.locked ? '🔒 Private table. ' : '') + (isHost ? (m.locked ? 'Share the code and the password “' + Host.password + '”.' : 'Share the code. 2–4 players.') : 'Waiting for the host to start…');
    $('#seats').innerHTML = m.players.map((p, i) => `<li><span class="lav">${Avatar.svg(p.av)}</span><span class="grow">${esc(p.name)}</span> <small>${p.bot ? 'bot' : i === 0 ? 'host' : ''}${i === m.you ? ' (you)' : ''}</small></li>`).join('');
    $('#hostCtl').classList.toggle('hidden', !isHost);
    $('#startBtn').disabled = m.players.length < 2;
    $('#addBot').disabled = m.players.length >= 4;
    try { history.replaceState(null, '', roomUrl(m.code)); } catch (e) {}
  }

  /* ---------- tiles & rendering ---------- */
  function face(el, id) {
    const t = L.tile(id);
    el.dataset.c = t.joker ? 'j' : t.color;
    el.innerHTML = `<b>${t.joker ? '★' : t.num}</b><i></i>`;
  }
  function getTile(id) {
    let el = tiles.get(id);
    if (!el) {
      el = document.createElement('div'); face(el, id);
      el.addEventListener('pointerdown', e => startDrag(e, id));
      tiles.set(id, el);
    }
    return el;
  }
  const myTurn = () => S && S.winner == null && S.turn === me;
  const canMoveBoard = id => myTurn() && (S.players[me].melded || !snapSet.has(id));

  function layoutRack() {
    const rack = $('#rack'), w = rack.clientWidth || window.innerWidth - 16, g = rackGeo;
    g.tw = clamp(Math.floor((w - 2 * g.pad) / 11 - g.gap), 26, 46); g.th = Math.round(g.tw * 1.38);
    g.cols = Math.max(1, Math.floor((w - 2 * g.pad + g.gap) / (g.tw + g.gap)));
    const rows = Math.max(2, Math.ceil(rackOrder.length / g.cols));
    let spacer = rack.querySelector('.spacer');
    if (!spacer) { spacer = document.createElement('div'); spacer.className = 'spacer'; rack.append(spacer); }
    rack.style.setProperty('--rowh', g.th + g.gap + 4 + 'px');
    spacer.style.height = rows * (g.th + g.gap + 4) + 2 * g.pad - g.gap + 'px';
    const meld = new Set(rackSegments().filter(s => L.analyzeSet(s).valid).flat());
    rackOrder.forEach((id, i) => {
      if (id === null) return;
      const el = getTile(id);
      if (el.parentNode !== rack) rack.append(el);
      el.style.setProperty('--w', g.tw + 'px');
      el.style.left = g.pad + (i % g.cols) * (g.tw + g.gap) + 'px';
      el.style.top = g.pad + Math.floor(i / g.cols) * (g.th + g.gap + 4) + 'px';
      el.className = 'tile' + (meld.has(id) ? ' meld' : '') + (drag && (drag.id === id || (drag.set && drag.set.includes(id))) ? ' lifted' : '') + (flying.has(id) ? ' hid' : '');
    });
  }
  /* rack slots: tile ids, with null = an empty gap between groups */
  function normalizeRack() {
    rackOrder = rackOrder.filter((v, i, a) => v !== null || (i > 0 && a[i - 1] !== null));
    while (rackOrder.length && rackOrder[rackOrder.length - 1] === null) rackOrder.pop();
  }
  function rackSegments() {
    const out = [[]];
    rackOrder.forEach(v => { if (v === null) out.push([]); else out[out.length - 1].push(v); });
    return out.filter(s => s.length);
  }
  const validSegOf = id => rackSegments().find(s => s.includes(id) && L.analyzeSet(s).valid);
  /* ready-to-play sets for the chosen sort: runs for 1·2·3, groups for 7·7·7 */
  function findSets(ids, mode) {
    const sets = [];
    if (mode === 'run') for (let c = 0; c < 4; c++) {
      const by = {}; ids.forEach(id => { const t = L.tile(id); if (!t.joker && t.color === c && !(t.num in by)) by[t.num] = id; });
      let seq = [];
      for (let n = 1; n <= 14; n++) { if (by[n] != null) seq.push(by[n]); else { if (seq.length >= 3) sets.push(seq); seq = []; } }
    } else for (let n = 1; n <= 13; n++) {
      const by = {}; ids.forEach(id => { const t = L.tile(id); if (!t.joker && t.num === n && !(t.color in by)) by[t.color] = id; });
      const g = Object.values(by); if (g.length >= 3) sets.push(g);
    }
    return sets;
  }

  function render() {
    if (!S) return;
    // players
    $('#players').innerHTML = S.players.map((p, i) =>
      `<div class="pl${i === S.turn ? ' turn' : ''}${p.melded ? ' melded' : ''}${p.off ? ' off' : ''}${i === me ? ' me' : ''}"><div class="av">${Avatar.svg(p.av)}<span class="ok">✓</span><span class="n">${p.count}</span></div><div class="nm">${i === me ? 'You' : esc(p.name)}</div></div>`).join('');
    $('#sortRun').classList.toggle('on', sortMode === 'run' && !manual); $('#sortGroup').classList.toggle('on', sortMode === 'group' && !manual);
    $('#shareRoom').classList.toggle('hidden', !roomCode);
    // table
    const world = $('#world'), bad = new Set(); let open = 0, placed = 0;
    const prev = new Map();
    tiles.forEach((el, id) => { if (el.isConnected) prev.set(id, { r: el.getBoundingClientRect(), where: el.parentNode === world ? 'board' : 'rack' }); });
    for (const set of L.boardSets(S.board)) {
      const a = L.analyzeSet(set);
      if (!a.valid) set.forEach(id => bad.add(id));
      else if (set.every(id => !snapSet.has(id))) open += a.value;
    }
    for (const k in S.board) {
      const id = +k, el = getTile(id), isNew = !snapSet.has(id);
      if (isNew) placed++;
      if (el.parentNode !== world) world.append(el);
      el.style.removeProperty('--w');
      el.style.left = S.board[k][0] * CW + 2 + 'px'; el.style.top = S.board[k][1] * CH + 2 + 'px';
      el.className = 'tile' + (bad.has(id) ? ' bad' : isNew ? ' placed' : '') + (drag && drag.id === id ? ' lifted' : '') + (flying.has(id) ? ' hid' : '');
      el.style.cursor = canMoveBoard(id) ? 'grab' : 'inherit';
    }
    layoutRack();
    tiles.forEach((el, id) => {
      if (id in S.board || rackOrder.includes(id)) return;
      const p = prev.get(id), to = p && R && p.where === 'board' && avatarRect(R.turn, p.r.width); // taken back into someone's rack
      if (to && !noAnim) fly(el.cloneNode(true), p.r, to, { out: true, dur: 340 });
      el.remove(); tiles.delete(id);
    });
    // controls
    const mine = myTurn(), st = $('#status');
    $('#mainBtn').disabled = !mine; $('#undoBtn').disabled = !mine || !placed;
    $('#mainBtn').innerHTML = `<span>${placed ? 'End turn' : S.pool ? 'Draw' : 'Pass'}</span><small>▦ ${S.pool} left</small>`;
    $('#mainBtn').dataset.act = placed ? 'end' : 'draw';
    st.classList.toggle('mine', mine);
    if (S.winner != null) st.textContent = 'Game over';
    else if (mine) st.textContent = S.players[me].melded ? (bad.size ? 'Fix the red sets to end your turn' : 'Your turn') : `Your turn · opening ${open}/30`;
    else st.textContent = S.players[S.turn].name + ' is playing…';
    animateChanges(prev);
    R = { turn: S.turn, counts: S.players.map(p => p.count), pool: S.pool };
    dropFrom.clear();
  }

  /* ---------- motion: tiles travel from where they really came from ---------- */
  function avatarRect(i, w) {
    const pl = $('#players').children[i], r = pl && pl.querySelector('.av').getBoundingClientRect();
    return r && r.width ? { left: r.left + r.width / 2 - w * 0.2, top: r.top + r.height / 2 - w * 0.28, width: w * 0.4 } : null;
  }
  function poolRect(w) { // the draw pile lives on the Draw button
    const r = $('#mainBtn').getBoundingClientRect();
    return r.width ? { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - w * 0.69, width: w } : null;
  }
  function fly(node, from, to, o) {
    o = o || {};
    const base = o.out ? from : to, k = r => `translate(${r.left - base.left}px,${r.top - base.top}px) scale(${r.width / base.width})`;
    node.className = 'tile fly' + (o.cls || ''); node.style.cssText = '';
    node.style.setProperty('--w', base.width + 'px'); node.style.left = base.left + 'px'; node.style.top = base.top + 'px';
    $('#draglayer').append(node);
    flights.push({ kind: o.kind || '', from: [Math.round(from.left), Math.round(from.top)], to: [Math.round(to.left), Math.round(to.top)] }); if (flights.length > 60) flights.shift();
    const a = node.animate([
      { transform: k(from), opacity: o.fadeIn ? 0.25 : 1 }, { opacity: 1, offset: o.out ? 0.6 : 0.3 }, { transform: k(to), opacity: o.out ? 0 : 1 },
    ], { duration: o.dur || 280, delay: o.delay || 0, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' });
    a.onfinish = a.oncancel = () => { node.remove(); if (o.onEnd) o.onEnd(); };
  }
  function animateChanges(prev) {
    if (noAnim) return;
    const world = $('#world'), ghostR = ghost && ghost.isConnected ? ghost.getBoundingClientRect() : null;
    const ids = [...tiles.keys()].sort((a, b) => (S.board[a] ? S.board[a][0] : 0) - (S.board[b] ? S.board[b][0] : 0));
    let kb = 0, kr = 0;
    for (const id of ids) {
      const el = tiles.get(id), p = prev.get(id), where = id in S.board ? 'board' : 'rack';
      let src = null, o = { dur: 260 };
      if (drag && (drag.id === id || (drag.set && drag.set.includes(id)))) continue;
      if (dropFrom.has(id)) { const r = dropFrom.get(id); src = () => r; o = { dur: 200, kind: 'drop' }; }               // released from my finger
      else if (!p && where === 'board') { if (!R) continue; src = w => ghostR || avatarRect(R.turn, w); o = { dur: 420, delay: 70 * kb++, fadeIn: !ghostR, kind: 'played' }; } // another player's tile
      else if (!p) { src = poolRect; o = { dur: 360, delay: (R ? 45 : 30) * kr++, fadeIn: true, kind: 'draw' }; }             // drawn / dealt to me
      else if (p.where !== where) { src = () => p.r; o = { dur: 300, kind: 'return' }; }                                    // undo, or my tile changing home
      if (!src) continue;
      el.style.transition = 'none'; const to = el.getBoundingClientRect(); el.style.transition = '';
      const from = to.width && src(to.width);
      if (!from) continue;
      flying.add(id); el.classList.add('hid');
      o.onEnd = () => {
        flying.delete(id);
        const e = tiles.get(id); if (!e) return;
        e.classList.remove('hid'); e.animate([{ transform: 'scale(1.14)' }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
      };
      fly(el.cloneNode(true), from, to, o);
    }
    if (R) S.players.forEach((p, i) => { // someone else drew: a face-down tile travels from the pile to them
      if (i === me || p.count <= R.counts[i] || S.pool >= R.pool) return;
      const from = poolRect(34), to = avatarRect(i, 34);
      if (from && to) fly(document.createElement('div'), from, to, { out: true, dur: 480, cls: ' back', kind: 'oppdraw' });
    });
    if (R && R.turn !== S.turn && S.winner == null) { // nudge the avatar whose turn just began
      const pl = $('#players').children[S.turn], av = pl && pl.querySelector('.av');
      if (av) av.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
    }
  }

  function sortRack(mode) {
    if (mode) sortMode = mode; else mode = sortMode;
    manual = false;
    const key = id => { const t = L.tile(id); return t.joker ? 1e4 + id : mode === 'run' ? t.color * 100 + t.num : t.num * 10 + t.color; };
    const ids = rackOrder.filter(v => v !== null).sort((a, b) => key(a) - key(b) || a - b);
    const sets = findSets(ids, mode), used = new Set(sets.flat());
    rackOrder = [];
    sets.forEach(s => rackOrder.push(...s, null));
    rackOrder.push(...ids.filter(id => !used.has(id)));
    normalizeRack();
  }

  function renderOver() {
    const rows = S.players.map((p, i) => ({ p, i, s: S.scores[i] })).sort((a, b) => a.s - b.s);
    $('#over').innerHTML = `<div class="card"><h1>${S.winner === me ? 'You win!' : esc(S.players[S.winner].name) + ' wins'}</h1>
      <ol>${rows.map(r => `<li class="${r.i === S.winner ? 'win' : ''}"><span class="lav">${Avatar.svg(r.p.av)}</span><span class="grow">${esc(r.p.name)}</span><span>${r.s ? '−' + r.s : '0'}</span></li>`).join('')}</ol>
      ${isHost ? '<button class="primary wide" id="againBtn">Play again</button>' : '<p class="tag" style="margin:0">Waiting for the host…</p>'}
      <button class="wide ghostbtn" id="menuBtn">Main menu</button></div>`;
    if (isHost) $('#againBtn').onclick = () => Host.start();
    $('#menuBtn').onclick = () => { location.href = location.pathname; };
  }

  /* ---------- table pan / zoom ---------- */
  function applyView() { $('#world').style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`; }
  function zoomAt(cx, cy, f) {
    const ns = clamp(view.s * f, 0.3, 2.2);
    view.x = cx - (cx - view.x) * ns / view.s; view.y = cy - (cy - view.y) * ns / view.s; view.s = ns; applyView();
  }
  function fit() {
    const b = $('#board'), bw = b.clientWidth, bh = b.clientHeight;
    let x0 = S.W / 2 - 5, x1 = S.W / 2 + 5, y0 = S.H / 2 - 2, y1 = S.H / 2 + 2;
    const pts = Object.values(S.board);
    if (pts.length) {
      x0 = Math.min(...pts.map(p => p[0])) - 1; x1 = Math.max(...pts.map(p => p[0])) + 2;
      y0 = Math.min(...pts.map(p => p[1])) - 0.6; y1 = Math.max(...pts.map(p => p[1])) + 1.6;
    }
    view.s = clamp(Math.min(bw / ((x1 - x0) * CW), bh / ((y1 - y0) * CH)), 0.3, 1.25);
    view.x = bw / 2 - (x0 + x1) / 2 * CW * view.s; view.y = bh / 2 - (y0 + y1) / 2 * CH * view.s;
    applyView();
  }
  const ptrs = new Map(); let pinch = 0;
  function boardXY(e) { const r = $('#board').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  $('#board').addEventListener('pointerdown', e => {
    if (e.target.closest('#zoom')) return;
    ptrs.set(e.pointerId, boardXY(e));
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  window.addEventListener('pointermove', e => {
    if (drag && e.pointerId === drag.pid) return moveDrag(e);
    const p = ptrs.get(e.pointerId); if (!p) return;
    const n = boardXY(e);
    if (ptrs.size === 1) { view.x += n.x - p.x; view.y += n.y - p.y; applyView(); }
    ptrs.set(e.pointerId, n);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && d > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
      pinch = d;
    }
  });
  const up = e => { if (drag && e.pointerId === drag.pid) endDrag(e, e.type === 'pointercancel'); ptrs.delete(e.pointerId); pinch = 0; };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  $('#board').addEventListener('wheel', e => { e.preventDefault(); const p = boardXY(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  $('#zoom').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !S) return;
    const bd = $('#board');
    if (b.dataset.z === 'in') zoomAt(bd.clientWidth / 2, bd.clientHeight / 2, 1.25);
    else if (b.dataset.z === 'out') zoomAt(bd.clientWidth / 2, bd.clientHeight / 2, 0.8);
    else if (b.dataset.z === 'fit') fit();
    else { document.body.classList.toggle('expanded'); setTimeout(() => { fit(); layoutRack(); }, 30); }
  });

  /* ---------- dragging tiles ---------- */
  function dragPoint(e) { return { x: e.clientX, y: e.clientY - (e.pointerType === 'touch' ? drag.h * 0.55 : 0) }; }
  function dragPoint2(e, d) { return e.clientY - (e.pointerType === 'touch' ? d.h * 0.55 : 0); }
  function targetAt(px, py) {
    const r = $('#rack').getBoundingClientRect(), g = rackGeo;
    if (r.height && py >= r.top - 4 && px >= r.left - 4 && px <= r.right + 4) {
      const col = clamp(Math.floor((px - r.left - g.pad + g.gap / 2) / (g.tw + g.gap)), 0, g.cols - 1);
      const row = Math.max(0, Math.floor((py - r.top + $('#rack').scrollTop - g.pad) / (g.th + g.gap + 4)));
      return { rack: true, index: row * g.cols + col };
    }
    const b = $('#board').getBoundingClientRect();
    if (py < b.top || py > b.bottom || px < b.left || px > b.right) return null;
    const bx = (px - b.left - view.x) / view.s, by = (py - b.top - view.y) / view.s;
    const x = Math.floor(bx / CW), y = Math.floor(by / CH);
    if (x < 0 || y < 0 || x >= S.W || y >= S.H) return null;
    return { x, y, bx, by };
  }
  function startDrag(e, id) {
    if (drag || !S || S.winner != null || e.button > 0 || ptrs.size) return;
    const onBoard = id in S.board;
    if (onBoard ? !canMoveBoard(id) : !S.rack.includes(id)) return; // falls through to table panning
    e.stopPropagation(); e.preventDefault();
    const el = tiles.get(id), r = el.getBoundingClientRect(), f = el.cloneNode(true);
    const w = Math.max(r.width, 40);
    f.className = 'tile float'; f.style.setProperty('--w', w + 'px');
    $('#draglayer').append(f); el.classList.add('lifted');
    drag = { id, f, pid: e.pointerId, from: onBoard ? 'board' : 'rack', w, tw: w, h: w * 1.38, last: 0, sent: false, sx: e.clientX, sy: e.clientY };
    if (!onBoard) { const seg = validSegOf(id); if (seg) drag.hold = setTimeout(() => grabSet(seg), 380); }
    moveDrag(e);
  }
  function grabSet(seg) { // press-and-hold: pick up the whole ready set
    if (!drag) return;
    drag.hold = null; drag.set = seg.slice(); drag.f.remove();
    const f = document.createElement('div'); f.className = 'floatset';
    seg.forEach(id => {
      const el = tiles.get(id), c = el.cloneNode(true);
      c.className = 'tile'; c.style.cssText = ''; c.style.setProperty('--w', drag.tw + 'px'); f.append(c); el.classList.add('lifted');
    });
    $('#draglayer').append(f); drag.f = f; drag.w = seg.length * drag.tw + (seg.length - 1) * 3;
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
    moveDrag(drag.ev);
  }
  function moveDrag(e) {
    drag.ev = e;
    if (drag.hold && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) { clearTimeout(drag.hold); drag.hold = null; }
    const p = dragPoint(e), t = targetAt(p.x, p.y), hint = $('#hint'), n = drag.set ? drag.set.length : 1;
    drag.f.style.left = p.x - drag.w / 2 + 'px'; drag.f.style.top = p.y - drag.h / 2 + 'px';
    if (t && !t.rack && myTurn()) {
      hint.style.display = 'block'; hint.style.left = (t.x - Math.floor((n - 1) / 2)) * CW + 2 + 'px'; hint.style.width = n * CW - 4 + 'px'; hint.style.top = t.y * CH + 2 + 'px';
      const now = performance.now();
      if (now - drag.last > 45) { drag.last = now; drag.sent = true; Net.send({ t: 'drag', id: drag.id, x: +(t.bx / CW - 0.5).toFixed(2), y: +(t.by / CH - 0.5).toFixed(2) }); }
    } else hint.style.display = 'none';
  }
  function endDrag(e, cancelled) {
    const d = drag, id = d.id, p = dragPoint(e), t = cancelled ? null : targetAt(p.x, p.y);
    if (d.set) [...d.f.children].forEach((c, k) => dropFrom.set(d.set[k], c.getBoundingClientRect()));
    else { const fr = d.f.getBoundingClientRect(); dropFrom.set(id, { left: e.clientX - d.w / 2, top: dragPoint2(e, d) - d.h / 2, width: d.w, raw: fr }); }
    clearTimeout(d.hold); d.f.remove(); $('#hint').style.display = 'none'; drag = null;
    if (d.set) {
      if (t && !t.rack) {
        const n = d.set.length, sx = t.x - Math.floor((n - 1) / 2);
        if (!myTurn()) toast('Wait for your turn');
        else if (sx < 0 || sx + n > S.W || !d.set.every(x => S.rack.includes(x)) || Object.values(S.board).some(q => q[1] === t.y && q[0] >= sx && q[0] < sx + n)) toast('Not enough room there');
        else d.set.forEach((x, k) => {
          S.rack = S.rack.filter(v => v !== x); rackOrder = rackOrder.filter(v => v !== x);
          S.board[x] = [sx + k, t.y]; sendSeq({ t: 'move', id: x, to: { x: sx + k, y: t.y } });
        });
      }
      if (d.sent) Net.send({ t: 'dragend' });
      normalizeRack(); render(); return;
    }
    const stillBoard = id in S.board, stillRack = S.rack.includes(id);
    if (t && t.rack) {
      if (stillRack) { rackOrder = rackOrder.filter(x => x !== id); rackOrder.splice(Math.min(t.index, rackOrder.length), 0, id); manual = true; }
      else if (stillBoard && myTurn()) {
        if (snapSet.has(id)) toast('That tile was already on the table');
        else { delete S.board[id]; S.rack.push(id); rackOrder.splice(Math.min(t.index, rackOrder.length), 0, id); sendSeq({ t: 'move', id, to: 'rack' }); }
      }
    } else if (t) {
      if (!myTurn()) toast('Wait for your turn');
      else if ((stillBoard && canMoveBoard(id)) || stillRack) {
        const taken = Object.keys(S.board).some(k => +k !== id && S.board[k][0] === t.x && S.board[k][1] === t.y);
        if (!taken) {
          if (stillRack) { S.rack = S.rack.filter(x => x !== id); rackOrder = rackOrder.filter(x => x !== id); }
          S.board[id] = [t.x, t.y]; sendSeq({ t: 'move', id, to: { x: t.x, y: t.y } });
        }
      }
    }
    if (d.sent) Net.send({ t: 'dragend' });
    normalizeRack(); render();
  }

  /* other players' tiles in mid-air */
  function showGhost(m) {
    if (!S) return;
    if (!ghost) { ghost = document.createElement('div'); $('#world').append(ghost); ghost.gid = null; }
    if (ghost.gid !== m.id) {
      ghost.gid = m.id; ghost.className = 'tile ghost' + (m.id < 0 ? ' back' : '');
      if (m.id >= 0) { face(ghost, m.id); const el = tiles.get(m.id); if (el) el.classList.add('lifted'); } else ghost.innerHTML = '';
    }
    ghost.style.left = m.x * CW + 2 + 'px'; ghost.style.top = m.y * CH + 2 + 'px';
  }
  function clearGhost() {
    if (!ghost) return;
    const el = tiles.get(ghost.gid); if (el && !(drag && drag.id === ghost.gid)) el.classList.remove('lifted');
    ghost.remove(); ghost = null;
  }

  /* ---------- buttons ---------- */
  $('#soloBtn').onclick = playSolo;
  $('#hostBtn').onclick = hostOnline;
  $('#joinBtn').onclick = () => joinOnline($('#code').value);
  $('#startBtn').onclick = () => { Host.timerSec = +$('#timerSel').value; Host.start(); };
  $('#addBot').onclick = () => { if (Host.seats.length < 4) { const b = BOTS[Host.seats.filter(s => s.bot).length]; Host.seats.push({ name: b[0], av: b[1], bot: true }); Host.sendLobby(); } };
  $('#leaveBtn').onclick = () => { location.href = location.pathname; };
  function share(url, text) {
    if (navigator.share) navigator.share({ title: 'Meldline', text, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => toast(url));
    else toast(url);
  }
  $('#shareBtn').onclick = $('#shareRoom').onclick = () => share(roomUrl(roomCode), 'Join my Meldline table' + (Host.password || $('#lobbyHint').textContent.includes('🔒') ? ' (ask me for the password)' : ''));
  $('#shareGame').onclick = () => share(location.origin + location.pathname, 'Play Meldline, a tile rummy game');
  $('#pwForm').onsubmit = e => {
    e.preventDefault();
    if (Net.conn && Net.conn.open) Net.conn.send({ t: 'join', name: myName(), av: myAv, pw: $('#pwInput').value.trim() });
    $('#pwModal').classList.add('hidden'); toast('Joining…', true);
  };
  $('#pwCancel').onclick = () => { location.href = location.pathname; };
  $('#sortRun').onclick = () => { sortRack('run'); render(); };
  $('#sortGroup').onclick = () => { sortRack('group'); render(); };
  $('#undoBtn').onclick = () => { if (myTurn()) sendSeq({ t: 'reset' }); };
  $('#mainBtn').onclick = () => { if (myTurn()) Net.send({ t: $('#mainBtn').dataset.act }); };
  window.addEventListener('resize', () => { if (S) { layoutRack(); } });
  window.addEventListener('orientationchange', () => setTimeout(() => { if (S) { layoutRack(); fit(); } }, 250));
  document.addEventListener('gesturestart', e => e.preventDefault());
  setInterval(() => {
    const t = $('#timer');
    if (!S || !deadline || S.winner != null) { t.textContent = ''; return; }
    const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); t.classList.toggle('low', s <= 15);
  }, 500);

  $('#avCard').addEventListener('click', e => {
    const b = e.target.closest('.cyc button'); if (!b) return;
    const k = b.parentNode.dataset.k, n = Avatar.N[k];
    myAv[k] = (myAv[k] + +b.dataset.d + n) % n; renderAvEditor();
  });
  $('#avRandom').onclick = () => { myAv = Avatar.random(); renderAvEditor(); };
  renderAvEditor();

  /* ---------- boot ---------- */
  try { $('#name').value = localStorage.getItem('meldline-name') || ''; } catch (e) {}
  const room = new URLSearchParams(location.search).get('room');
  if (room) $('#code').value = room.toUpperCase().slice(0, 5);
  window.__meldline = { Host, get S() { return S; }, get rack() { return rackOrder; }, flights }; // handy for debugging
})();
