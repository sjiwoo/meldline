const L = require('../js/logic.js');
const assert = require('assert');
// id helper: color 0-3, num 1-13, copy 0/1
const T = (c, n, copy = 0) => copy * 52 + c * 13 + (n - 1);
const J = 104;

assert(L.analyzeSet([T(0, 3), T(0, 4), T(0, 5)]).valid);
assert.strictEqual(L.analyzeSet([T(0, 3), T(0, 4), T(0, 5)]).value, 12);
assert(!L.analyzeSet([T(0, 3), T(0, 4)]).valid);
assert(!L.analyzeSet([T(0, 3), T(1, 4), T(0, 5)]).valid);
assert(!L.analyzeSet([T(0, 12), T(0, 13), T(0, 1)]).valid);
assert(L.analyzeSet([T(0, 7), T(1, 7), T(2, 7), T(3, 7)]).valid);
assert(!L.analyzeSet([T(0, 7), T(1, 7), T(1, 7, 1)]).valid);
assert(!L.analyzeSet([T(0, 7), T(1, 7), T(2, 7), T(3, 7), J]).valid);
assert.strictEqual(L.analyzeSet([T(0, 11), J, T(0, 13)]).value, 36);
assert(!L.analyzeSet([J, T(0, 1), T(0, 2)]).valid);
assert(!L.analyzeSet([T(0, 12), T(0, 13), J]).valid);
assert.strictEqual(L.analyzeSet([T(0, 9), T(1, 9), J]).value, 27);

// seeded rng
function rng(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// opening rule + move rules
{
  const g = L.newGame([{ name: 'a' }, { name: 'b' }], rng(1));
  const pi = g.turn, p = g.players[pi];
  p.rack = [T(0, 1), T(0, 2), T(0, 3), T(1, 10), T(2, 10), T(3, 10), T(0, 9)];
  g.snap.rack = p.rack.slice();
  assert(!L.move(g, 1 - pi, g.players[1 - pi].rack[0], { x: 0, y: 0 }).ok);
  [T(0, 1), T(0, 2), T(0, 3)].forEach((id, k) => assert(L.move(g, pi, id, { x: 5 + k, y: 2 }).ok));
  assert(!L.move(g, pi, T(0, 9), { x: 5, y: 2 }).ok, 'occupied');
  assert(/30/.test(L.endTurn(g, pi).err));
  [T(1, 10), T(2, 10), T(3, 10)].forEach((id, k) => assert(L.move(g, pi, id, { x: 5 + k, y: 4 }).ok));
  assert(L.move(g, pi, T(1, 10), 'rack').ok);
  assert(/3 or more/.test(L.endTurn(g, pi).err));
  assert(L.reset(g, pi).ok);
  assert.strictEqual(p.rack.length, 7);
  assert.strictEqual(Object.keys(g.board).length, 0);
  [T(0, 1), T(0, 2), T(0, 3)].forEach((id, k) => L.move(g, pi, id, { x: 5 + k, y: 2 }));
  [T(1, 10), T(2, 10), T(3, 10)].forEach((id, k) => L.move(g, pi, id, { x: 5 + k, y: 4 }));
  assert(L.endTurn(g, pi).ok);
  assert(p.melded && g.turn === 1 - pi);
  // other player, not melded, cannot touch table tiles or extend sets
  const q = g.players[g.turn];
  assert(!L.move(g, g.turn, T(0, 1), { x: 0, y: 0 }).ok);
  assert(!L.move(g, g.turn, T(0, 1), 'rack').ok);
  q.rack.push(T(0, 4)); g.snap.rack = q.rack.slice();
  L.move(g, g.turn, T(0, 4), { x: 8, y: 2 });
  assert(/own tiles/.test(L.endTurn(g, g.turn).err));
  const before = q.rack.length;
  assert(L.draw(g, g.turn).ok);
  assert.strictEqual(q.rack.length, before + 2); // tile came back + drew one
  assert.strictEqual(g.turn, pi);
  // melded player may rearrange and wins by emptying rack
  p.rack = [T(0, 4)]; g.snap.rack = p.rack.slice();
  assert(L.move(g, pi, T(0, 4), { x: 8, y: 2 }).ok);
  assert(L.endTurn(g, pi).ok);
  assert.strictEqual(g.winner, pi);
  assert.strictEqual(g.scores[pi], 0);
}

// bot-vs-bot full games terminate with a consistent table
let wins = 0, turnsTotal = 0;
for (let seed = 1; seed <= 300; seed++) {
  const n = 2 + (seed % 3);
  const g = L.newGame(Array.from({ length: n }, (_, i) => ({ name: 'b' + i, bot: true })), rng(seed));
  let turns = 0;
  while (g.winner == null && turns++ < 2000) {
    L.botTurn(g);
    const all = [...g.pool, ...Object.keys(g.board).map(Number), ...g.players.flatMap(p => p.rack)];
    assert.strictEqual(all.length, 106);
    assert.strictEqual(new Set(all).size, 106);
    for (const s of L.boardSets(g.board)) assert(L.analyzeSet(s).valid, 'invalid set left on table');
  }
  assert(g.winner != null, 'game did not finish, seed ' + seed);
  if (g.players[g.winner].rack.length === 0) wins++;
  turnsTotal += turns;
}
console.log('ok — 300 bot games finished;', wins, 'won by emptying the rack; avg turns', Math.round(turnsTotal / 300));
