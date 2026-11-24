/* Meldline — pure game rules (shared by browser host and node tests). */
(function (root) {
  const W = 36, H = 14;

  function tile(id) {
    if (id >= 104) return { id, joker: true };
    const k = id % 52;
    return { id, color: Math.floor(k / 13), num: (k % 13) + 1 };
  }
  const points = id => (id >= 104 ? 30 : tile(id).num);

  /* A set is an ordered list of tile ids, left to right. */
  function analyzeSet(ids) {
    const n = ids.length;
    if (n < 3) return { valid: false };
    const ts = ids.map(tile), real = ts.filter(t => !t.joker);
    if (!real.length) return { valid: false };
    let group = null, run = null;
    if (n <= 4) {
      const num = real[0].num, colors = real.map(t => t.color);
      if (real.every(t => t.num === num) && new Set(colors).size === real.length)
        group = { valid: true, kind: 'group', value: num * n, num, colors };
    }
    if (n <= 13) {
      const color = real[0].color;
      if (real.every(t => t.color === color)) {
        const i = ts.findIndex(t => !t.joker), start = ts[i].num - i;
        if (start >= 1 && start + n - 1 <= 13 && ts.every((t, j) => t.joker || t.num === start + j))
          run = { valid: true, kind: 'run', value: n * start + (n * (n - 1)) / 2, start, color };
      }
    }
    if (group && run) return group.value >= run.value ? group : run;
    return group || run || { valid: false };
  }

  /* Sets on the table = maximal horizontal strips of touching tiles. */
  function boardSets(board) {
    const rows = {};
    for (const k in board) (rows[board[k][1]] = rows[board[k][1]] || []).push(+k);
    const sets = [];
    for (const y in rows) {
      const ids = rows[y].sort((a, b) => board[a][0] - board[b][0]);
      let cur = [];
      for (const id of ids) {
        if (cur.length && board[id][0] !== board[cur[cur.length - 1]][0] + 1) { sets.push(cur); cur = []; }
        cur.push(id);
      }
      if (cur.length) sets.push(cur);
    }
    return sets;
  }

  function occupied(board, x, y, except) {
    for (const k in board) if (+k !== except && board[k][0] === x && board[k][1] === y) return true;
    return false;
  }

  function newGame(seats, rng) {
    rng = rng || Math.random;
    const pool = Array.from({ length: 106 }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const g = {
      pool, board: {}, turn: 0, winner: null, scores: null, passes: 0, snap: null,
      players: seats.map(s => ({ name: s.name, bot: !!s.bot, melded: false, rack: pool.splice(0, 14) })),
    };
    g.turn = Math.floor(rng() * g.players.length);
    beginTurn(g);
    return g;
  }

  function beginTurn(g) {
    g.snap = { board: JSON.parse(JSON.stringify(g.board)), rack: g.players[g.turn].rack.slice() };
  }
  function advance(g) { g.turn = (g.turn + 1) % g.players.length; beginTurn(g); }
  const fail = err => ({ ok: false, err });
  const live = (g, pi) => g.winner == null && pi === g.turn;

  function move(g, pi, id, to) {
    if (!live(g, pi)) return fail('Not your turn');
    const p = g.players[pi], onBoard = id in g.board, inRack = p.rack.includes(id);
    if (to === 'rack') {
      if (!onBoard || id in g.snap.board) return fail('Only tiles you played this turn can come back');
      delete g.board[id]; p.rack.push(id);
      return { ok: true };
    }
    if (!to || !Number.isInteger(to.x) || !Number.isInteger(to.y) || to.x < 0 || to.y < 0 || to.x >= W || to.y >= H)
      return fail('Off the table');
    if (occupied(g.board, to.x, to.y, id)) return fail('That spot is taken');
    if (onBoard) {
      if (id in g.snap.board && !p.melded) return fail('Make your 30-point opening before rearranging the table');
    } else if (inRack) p.rack.splice(p.rack.indexOf(id), 1);
    else return fail('Not your tile');
    g.board[id] = [to.x, to.y];
    return { ok: true };
  }

  function reset(g, pi) {
    if (!live(g, pi)) return fail('Not your turn');
    g.board = JSON.parse(JSON.stringify(g.snap.board));
    g.players[pi].rack = g.snap.rack.slice();
    return { ok: true };
  }

  function finish(g, winner) {
    g.scores = g.players.map(p => p.rack.reduce((s, id) => s + points(id), 0));
    g.winner = winner != null ? winner : g.scores.indexOf(Math.min(...g.scores));
  }

  function endTurn(g, pi) {
    if (!live(g, pi)) return fail('Not your turn');
    const p = g.players[pi];
    const placed = new Set(Object.keys(g.board).map(Number).filter(id => !(id in g.snap.board)));
    if (!placed.size) return fail('Play at least one tile, or draw');
    let open = 0;
    for (const s of boardSets(g.board)) {
      const a = analyzeSet(s);
      if (!a.valid) return fail('Every set on the table must be a run or group of 3 or more');
      if (!p.melded) {
        const k = s.filter(id => placed.has(id)).length;
        if (k && k < s.length) return fail('Your opening must use only your own tiles');
        if (k) open += a.value;
      }
    }
    if (!p.melded) {
      if (open < 30) return fail('Opening sets must total 30+ points (you have ' + open + ')');
      p.melded = true;
    }
    g.passes = 0;
    if (!p.rack.length) finish(g, pi); else advance(g);
    return { ok: true };
  }

  function draw(g, pi) {
    if (!live(g, pi)) return fail('Not your turn');
    reset(g, pi);
    if (g.pool.length) { g.players[pi].rack.push(g.pool.pop()); g.passes = 0; }
    else if (++g.passes >= g.players.length) { finish(g, null); return { ok: true }; }
    advance(g);
    return { ok: true };
  }

  function view(g, pi) {
    return {
      W, H, you: pi, board: g.board, snap: Object.keys(g.snap.board).map(Number), turn: g.turn,
      pool: g.pool.length, rack: g.players[pi].rack, winner: g.winner, scores: g.scores,
      players: g.players.map(p => ({ name: p.name, bot: p.bot, melded: p.melded, count: p.rack.length })),
    };
  }

  /* ---------- simple bot ---------- */
  function planSets(rack, runsFirst) {
    const rem = new Set(rack.filter(id => id < 104)), sets = [];
    const runs = () => {
      for (let c = 0; c < 4; c++) {
        const by = {};
        rem.forEach(id => { const t = tile(id); if (t.color === c && !(t.num in by)) by[t.num] = id; });
        let seq = [];
        for (let n = 1; n <= 14; n++) {
          if (by[n] != null) seq.push(by[n]);
          else { if (seq.length >= 3) { sets.push(seq); seq.forEach(id => rem.delete(id)); } seq = []; }
        }
      }
    };
    const groups = () => {
      for (let n = 1; n <= 13; n++) {
        const by = {};
        rem.forEach(id => { const t = tile(id); if (t.num === n && !(t.color in by)) by[t.color] = id; });
        const ids = Object.values(by);
        if (ids.length >= 3) { sets.push(ids); ids.forEach(id => rem.delete(id)); }
      }
    };
    if (runsFirst) { runs(); groups(); } else { groups(); runs(); }
    for (const j of rack.filter(id => id >= 104)) {
      const ids = [...rem].sort((a, b) => points(b) - points(a));
      let made = null;
      outer: for (const a of ids) for (const b of ids) {
        const ta = tile(a), tb = tile(b);
        if (a === b) continue;
        if (ta.color === tb.color && tb.num === ta.num + 1) { made = tb.num < 13 ? [a, b, j] : [j, a, b]; break outer; }
        if (ta.num === tb.num && ta.color !== tb.color) { made = [a, b, j]; break outer; }
      }
      if (made) { sets.push(made); made.forEach(id => rem.delete(id)); }
    }
    return { sets, value: sets.reduce((s, x) => s + analyzeSet(x).value, 0) };
  }

  function findSpot(board, len) {
    const occ = new Set(Object.values(board).map(p => p[0] + ',' + p[1]));
    let best = null, bd = 1e9;
    for (let y = 0; y < H; y++) for (let x = 0; x + len <= W; x++) {
      let free = true;
      for (let k = -1; k <= len && free; k++) if (occ.has((x + k) + ',' + y)) free = false;
      if (!free) continue;
      const d = Math.abs(x + len / 2 - W / 2) + Math.abs(y - H / 2) * 3;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  }

  function botTurn(g) {
    const pi = g.turn, p = g.players[pi];
    const a = planSets(p.rack, true), b = planSets(p.rack, false), plan = a.value >= b.value ? a : b;
    if (!p.melded && plan.value < 30) return draw(g, pi);
    for (const set of plan.sets) {
      const spot = findSpot(g.board, set.length);
      if (!spot) break;
      set.forEach((id, k) => move(g, pi, id, { x: spot.x + k, y: spot.y }));
    }
    if (p.melded) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const id of p.rack.slice()) {
          const t = tile(id);
          if (t.joker) continue;
          for (const set of boardSets(g.board)) {
            const s = analyzeSet(set);
            if (!s.valid) continue;
            const x0 = g.board[set[0]][0], y = g.board[set[0]][1], x1 = x0 + set.length - 1;
            let tx = null;
            if (s.kind === 'group') { if (set.length === 3 && s.num === t.num && !s.colors.includes(t.color)) tx = x1 + 1; }
            else if (s.color === t.color) {
              if (t.num === s.start + set.length) tx = x1 + 1; else if (t.num === s.start - 1) tx = x0 - 1;
            }
            if (tx == null || tx < 0 || tx >= W) continue;
            const beyond = tx > x1 ? tx + 1 : tx - 1;
            if (occupied(g.board, tx, y) || occupied(g.board, beyond, y)) continue;
            if (move(g, pi, id, { x: tx, y }).ok) { changed = true; break; }
          }
        }
        if (changed) continue;
        // borrow an end tile from a 4+ set to complete a pair from the rack
        const rk = p.rack.filter(id => id < 104);
        steal: for (const set of boardSets(g.board)) {
          if (set.length < 4 || !analyzeSet(set).valid) continue;
          for (const b of [set[0], set[set.length - 1]]) {
            if (b >= 104) continue;
            for (let i = 0; i < rk.length; i++) for (let j = i + 1; j < rk.length; j++) {
              const trio = [rk[i], b, rk[j]].sort((x, y) => tile(x).num - tile(y).num);
              if (!analyzeSet(trio).valid) continue;
              const from = g.board[b].slice();
              delete g.board[b];
              const spot = findSpot(g.board, 3);
              g.board[b] = from;
              if (!spot) continue;
              trio.forEach((id, k) => move(g, pi, id, { x: spot.x + k, y: spot.y }));
              changed = true; break steal;
            }
          }
        }
      }
    }
    const r = endTurn(g, pi);
    return r.ok ? r : draw(g, pi);
  }

  const api = { W, H, tile, points, analyzeSet, boardSets, newGame, move, reset, endTurn, draw, view, botTurn, planSets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
