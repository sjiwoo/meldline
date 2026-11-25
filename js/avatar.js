/* Meldline — little original critter avatars, drawn as SVG from four numbers. */
(function (root) {
  const FUR = [['#f2a65a', '#c97a2e'], ['#a9b3bc', '#737e88'], ['#f6f1e7', '#cfc7b6'], ['#8a6548', '#5a3f2c'], ['#74c479', '#3f8f4a'], ['#ee98b8', '#c05f86'], ['#86bdea', '#4a86c0'], ['#474d57', '#262a31']];
  const BG = ['#0d8f88', '#c2553f', '#6848d8', '#3b6fb5', '#d99a1c', '#2f9e5b', '#b84a8f', '#55606e'];
  const KINDS = ['Cat', 'Bear', 'Fox', 'Owl', 'Frog', 'Robot', 'Rabbit'];
  const ACCS = ['None', 'Glasses', 'Shades', 'Top hat', 'Crown', 'Bow tie', 'Headphones'];
  const N = { kind: KINDS.length, col: FUR.length, bg: BG.length, acc: ACCS.length };
  const INK = '#1d1d24';

  const eyes = (y, dx) => [32 - dx, 32 + dx].map(x => `<circle cx="${x}" cy="${y}" r="3.1" fill="${INK}"/><circle cx="${x + 1}" cy="${y - 1}" r="1" fill="#fff"/>`).join('');
  const smile = y => `<path d="M27 ${y} Q32 ${y + 4} 37 ${y}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;

  const DRAW = [
    (c, d) => `<path d="M13 30 L17 9 L31 21Z M51 30 L47 9 L33 21Z" fill="${c}"/><path d="M17.5 24 L19 14 L26 20Z M46.5 24 L45 14 L38 20Z" fill="${d}"/>
      <ellipse cx="32" cy="38" rx="20" ry="17.5" fill="${c}"/>${eyes(36, 8)}<path d="M30 42 h4 l-2 2.6Z" fill="#e57f8f"/>${smile(46)}
      <path d="M13 41 h8 M13 45 h8 M43 41 h8 M43 45 h8" stroke="${d}" stroke-width="1.2" stroke-linecap="round"/>`,
    (c, d) => `<circle cx="15.5" cy="20" r="7.5" fill="${c}"/><circle cx="48.5" cy="20" r="7.5" fill="${c}"/><circle cx="15.5" cy="20" r="3.6" fill="${d}"/><circle cx="48.5" cy="20" r="3.6" fill="${d}"/>
      <circle cx="32" cy="38" r="19.5" fill="${c}"/><ellipse cx="32" cy="45" rx="9" ry="7" fill="#fff5e6" opacity=".85"/>${eyes(35, 8)}<ellipse cx="32" cy="42" rx="3.2" ry="2.3" fill="${INK}"/>${smile(46)}`,
    (c, d) => `<path d="M11 31 L13 7 L29 20Z M53 31 L51 7 L35 20Z" fill="${c}"/><path d="M15 23 L16 13 L24 20Z M49 23 L48 13 L40 20Z" fill="${INK}"/>
      <path d="M11 31 Q32 15 53 31 Q50 48 32 58 Q14 48 11 31Z" fill="${c}"/><path d="M12.5 37 Q22 40 32 58 Q16 50 12.5 37Z M51.5 37 Q42 40 32 58 Q48 50 51.5 37Z" fill="#fffaf0"/>
      ${eyes(35, 8.5)}<ellipse cx="32" cy="54" rx="3" ry="2.2" fill="${INK}"/>`,
    (c, d) => `<path d="M15 24 L16 10 L27 19Z M49 24 L48 10 L37 19Z" fill="${d}"/><ellipse cx="32" cy="38" rx="19.5" ry="20" fill="${c}"/><path d="M20 52 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0" fill="none" stroke="${d}" stroke-width="1.6"/>
      <circle cx="23.5" cy="34" r="8.5" fill="#fffaf0"/><circle cx="40.5" cy="34" r="8.5" fill="#fffaf0"/><circle cx="24.5" cy="34.5" r="3.6" fill="${INK}"/><circle cx="39.5" cy="34.5" r="3.6" fill="${INK}"/>
      <circle cx="25.6" cy="33.3" r="1.1" fill="#fff"/><circle cx="40.6" cy="33.3" r="1.1" fill="#fff"/><path d="M29 40 h6 l-3 5.5Z" fill="#f0a030"/>`,
    (c, d) => `<circle cx="20.5" cy="25" r="9" fill="${c}"/><circle cx="43.5" cy="25" r="9" fill="${c}"/><ellipse cx="32" cy="42" rx="22" ry="15.5" fill="${c}"/>
      <circle cx="20.5" cy="25" r="5.6" fill="#fffaf0"/><circle cx="43.5" cy="25" r="5.6" fill="#fffaf0"/><circle cx="21" cy="25.5" r="2.8" fill="${INK}"/><circle cx="43" cy="25.5" r="2.8" fill="${INK}"/>
      <path d="M20 45 Q32 54 44 45" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="42" r="2.6" fill="${d}" opacity=".6"/><circle cx="47" cy="42" r="2.6" fill="${d}" opacity=".6"/>`,
    (c, d) => `<path d="M32 20 V11" stroke="${d}" stroke-width="2.4"/><circle cx="32" cy="9.5" r="3.2" fill="#ffd45e"/><rect x="8.5" y="31" width="6" height="12" rx="2.5" fill="${d}"/><rect x="49.500" y="31" width="6" height="12" rx="2.5" fill="${d}"/>
      <rect x="13" y="20" width="38" height="34" rx="9" fill="${c}"/><rect x="18" y="26" width="28" height="15" rx="5" fill="#1b2430"/>
      <rect x="22.5" y="30" width="6" height="7" rx="1.6" fill="#7ff3e6"/><rect x="35.500" y="30" width="6" height="7" rx="1.6" fill="#7ff3e6"/>
      <path d="M24 47 h16" stroke="${d}" stroke-width="3" stroke-linecap="round" stroke-dasharray="2.200 2.400"/>`,
    (c, d) => `<ellipse cx="23.5" cy="17" rx="5.6" ry="14.5" fill="${c}"/><ellipse cx="40.5" cy="17" rx="5.6" ry="14.5" fill="${c}"/><ellipse cx="23.5" cy="17" rx="2.5" ry="10" fill="#f3a9b8"/><ellipse cx="40.5" cy="17" rx="2.5" ry="10" fill="#f3a9b8"/>
      <ellipse cx="32" cy="41" rx="18.5" ry="16.5" fill="${c}"/>${eyes(38, 7.5)}<path d="M30 43.500 h4 l-2 2.500Z" fill="#e57f8f"/><rect x="29.800" y="47.500" width="4.400" height="4.600" rx="1" fill="#fff" stroke="${d}" stroke-width=".7"/>`,
  ];
  const EYE_Y = [36, 35, 35, 34, 25, 33.5, 38], EYE_DX = [8, 8, 8.5, 8.5, 11.5, 6.5, 7.5];

  function accessory(i, k) {
    const y = EYE_Y[k], dx = EYE_DX[k];
    switch (i) {
      case 1: return `<g fill="#ffffff30" stroke="${INK}" stroke-width="1.8"><circle cx="${32 - dx}" cy="${y}" r="6"/><circle cx="${32 + dx}" cy="${y}" r="6"/></g><path d="M${38 - dx} ${y} H${26 + dx}" stroke="${INK}" stroke-width="1.8"/>`;
      case 2: return `<path d="M${22.5 - dx + 3} ${y - 4} h${2 * dx + 13} v3.500 a6 5.500 0 0 1 -6 5.500 h-3 a5.500 5.500 0 0 1 -5.500 -5 h-${2 * dx - 9.5} a5.500 5.500 0 0 1 -5.500 5 h-3 a6 5.500 0 0 1 -6 -5.500Z" fill="${INK}"/><path d="M${28 - dx} ${y - 2} l3 3" stroke="#fff" stroke-width="1.200" opacity=".7"/>`;
      case 3: return `<rect x="15" y="16" width="34" height="4.600" rx="2.300" fill="${INK}"/><rect x="21" y="1.500" width="22" height="15.500" rx="2.500" fill="${INK}"/><rect x="21" y="12" width="22" height="3.400" fill="#c2553f"/>`;
      case 4: return `<path d="M18 20 L16.500 6 L25 13 L32 3.500 L39 13 L47.500 6 L46 20Z" fill="#ffcf4a" stroke="#c98f12" stroke-width="1.200" stroke-linejoin="round"/><circle cx="32" cy="15" r="2.200" fill="#e0523a"/><circle cx="23.500" cy="16" r="1.500" fill="#3b6fb5"/><circle cx="40.500" cy="16" r="1.500" fill="#3b6fb5"/>`;
      case 5: return `<path d="M32 58 L22 52.500 V63.500Z M32 58 L42 52.500 V63.500Z" fill="#e0523a" stroke="#9c2f1e" stroke-width="1"/><circle cx="32" cy="58" r="2.800" fill="#9c2f1e"/>`;
      case 6: return `<path d="M11 38 V32 a21 21 0 0 1 42 0 V38" fill="none" stroke="${INK}" stroke-width="3.400" stroke-linecap="round"/><rect x="6.500" y="31" width="8.500" height="15" rx="4" fill="#e0523a" stroke="${INK}" stroke-width="1.200"/><rect x="49" y="31" width="8.500" height="15" rx="4" fill="#e0523a" stroke="${INK}" stroke-width="1.200"/>`;
    }
    return '';
  }

  const int = (v, n) => { v = Math.floor(+v); return v >= 0 && v < n ? v : 0; };
  function clean(a) { a = a && typeof a === 'object' ? a : {}; return { kind: int(a.kind, N.kind), col: int(a.col, N.col), bg: int(a.bg, N.bg), acc: int(a.acc, N.acc) }; }
  function random() { const r = n => Math.floor(Math.random() * n); return { kind: r(N.kind), col: r(N.col), bg: r(N.bg), acc: r(N.acc) }; }
  function svg(a) {
    a = clean(a);
    const [c, d] = FUR[a.col], bg = BG[a.bg];
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="${bg}"/><ellipse cx="32" cy="16" rx="26" ry="13" fill="#fff" opacity=".13"/>${DRAW[a.kind](c, d)}${accessory(a.acc, a.kind)}</svg>`;
  }
  root.Avatar = { svg, clean, random, N, KINDS, ACCS };
})(window);
