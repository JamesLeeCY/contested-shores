// Story-card illustrations: layered silhouettes as inline SVG (no image files to load).
// Each scene is drawn in a 600×180 box and cropped to the card.

const W = 600;
const H = 180;

function sky(id: string, top: string, bottom: string) {
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${id})"/>`;
}

/** A ridge line across the box: random-walk heights from a fixed seed. */
function ridge(seed: number, base: number, amp: number, color: string, opacity = 1, steps = 24) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts: string[] = [`0,${H}`];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * W;
    const y = base - amp * (0.5 + 0.5 * Math.sin(i * 0.9 + seed)) * (0.6 + 0.4 * rnd());
    pts.push(`${x.toFixed(0)},${y.toFixed(0)}`);
  }
  pts.push(`${W},${H}`);
  return `<polygon points="${pts.join(' ')}" fill="${color}" opacity="${opacity}"/>`;
}

function junk(x: number, y: number, s: number, color: string) {
  const sail = (sx: number, h: number) =>
    `<path d="M${sx},${-8} l${-10},${-h} l${18},${-h * 0.15} l${2},${h * 1.05} z" fill="${color}"/>` +
    Array.from({ length: 4 }, (_, k) => `<line x1="${sx - 2 - k * 2}" y1="${-12 - k * h * 0.22}" x2="${sx + 8}" y2="${-12 - k * h * 0.24}" stroke="#d8b98a" stroke-opacity="0.35" stroke-width="0.8"/>`).join('');
  return `<g transform="translate(${x},${y}) scale(${s})"><path d="M-30,-8 Q-28,4 -10,4 L24,4 Q34,0 36,-12 L22,-8 Z" fill="${color}"/>${sail(-6, 34)}${sail(14, 26)}</g>`;
}

function wall(x: number, y: number, w: number, h: number, color: string) {
  const merlons = Array.from({ length: Math.floor(w / 8) }, (_, k) => `<rect x="${x + k * 8}" y="${y - 4}" width="5" height="4" fill="${color}"/>`).join('');
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>${merlons}`;
}

function conifers(y: number, color: string, n: number, seed: number) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = ((i * 97 + seed * 31) % W) + ((i * 13) % 7);
    const h = 18 + ((i * 37 + seed) % 14);
    out += `<path d="M${x},${y - h} l${-h * 0.32},${h} l${h * 0.64},0 z" fill="${color}"/>`;
  }
  return out;
}

const scenes: Record<string, () => string> = {
  sea: () =>
    sky('s', '#2c4763', '#d79a64') +
    `<circle cx="430" cy="112" r="22" fill="#f6d38e" opacity="0.9"/>` +
    ridge(3, 112, 18, '#3d4d58', 0.9, 10).replace(/0,180/, '340,180') +
    `<rect y="112" width="${W}" height="68" fill="#24445a"/>` +
    Array.from({ length: 12 }, (_, k) => `<line x1="${380 + (k % 3) * 18 - k * 2}" y1="${118 + k * 5}" x2="${470 - (k % 4) * 9 + k * 2}" y2="${118 + k * 5}" stroke="#f6d38e" stroke-opacity="${0.5 - k * 0.035}" stroke-width="1.5"/>`).join('') +
    junk(150, 140, 1.4, '#1b2630') +
    junk(250, 126, 0.9, '#22303a') +
    junk(70, 122, 0.7, '#283842') +
    `<path d="M300,40 q5,-4 10,0 q5,-4 10,0 M330,55 q4,-3 8,0 q4,-3 8,0" stroke="#1b2630" fill="none" stroke-width="1.5"/>`,
  fort: () =>
    sky('f', '#5a6b78', '#c9b48a') +
    `<rect y="118" width="${W}" height="62" fill="#3c6176"/>` +
    `<path d="M0,128 Q200,116 600,124 L600,180 L0,180 Z" fill="#cdb684"/>` +
    wall(160, 86, 280, 40, '#7a4a36') +
    wall(140, 70, 50, 56, '#6a3f2e') +
    wall(410, 70, 50, 56, '#6a3f2e') +
    `<rect x="250" y="56" width="100" height="30" fill="#d6c9ac"/><path d="M240,58 L300,30 L360,58 Z" fill="#8f3a28"/>` +
    `<line x1="300" y1="30" x2="300" y2="6" stroke="#2a1d14" stroke-width="2"/><path d="M300,6 l20,5 l-20,5 z" fill="#c0392b"/>` +
    `<circle cx="470" cy="60" r="12" fill="#e6e1d6" opacity="0.6"/><circle cx="486" cy="52" r="9" fill="#e6e1d6" opacity="0.5"/><circle cx="500" cy="44" r="7" fill="#e6e1d6" opacity="0.35"/>` +
    junk(530, 142, 0.8, '#26343e'),
  mountain: () =>
    sky('m', '#9fb6bf', '#e4dcc4') +
    ridge(7, 70, 40, '#8ea3a6', 0.9) +
    `<rect y="78" width="${W}" height="14" fill="#f2efe6" opacity="0.5"/>` +
    ridge(11, 100, 40, '#5f7a6a', 0.95) +
    `<rect y="104" width="${W}" height="12" fill="#f2efe6" opacity="0.35"/>` +
    ridge(19, 128, 36, '#3f5a44') +
    ridge(23, 158, 26, '#2c4130') +
    conifers(168, '#1f3022', 26, 5),
  hill: () =>
    sky('h', '#3f4f5c', '#d79a64') +
    ridge(5, 120, 14, '#5a5f4a', 0.8, 12) +
    `<path d="M120,180 Q300,60 480,180 Z" fill="#6b6440"/>` +
    wall(255, 86, 90, 20, '#5a4a36') +
    `<line x1="300" y1="86" x2="300" y2="58" stroke="#2a1d14" stroke-width="2"/><path d="M300,58 l18,5 l-18,5 z" fill="#c0392b"/>` +
    `<path d="M0,180 L0,150 Q150,140 300,170 L300,180 Z" fill="#3d4a2c"/>` +
    conifers(176, '#2a3320', 8, 2),
  city: () =>
    sky('c', '#6f8794', '#e2cf9e') +
    ridge(13, 84, 30, '#7d9196', 0.8) +
    `<rect y="118" width="${W}" height="62" fill="#7a8f4f"/>` +
    wall(110, 96, 380, 36, '#77736a') +
    `<rect x="270" y="74" width="60" height="24" fill="#9c3a2a"/>` +
    `<path d="M244,78 Q258,76 266,62 L334,62 Q342,76 356,78 Z" fill="#4c5156"/>` +
    `<path d="M262,62 L338,62 M262,62 q-4,-2 -6,-6 M338,62 q4,-2 6,-6" stroke="#2f3236" stroke-width="3" fill="none"/>` +
    `<path d="M282,132 L282,112 Q300,100 318,112 L318,132 Z" fill="#2f2a24"/>` +
    `<line x1="230" y1="96" x2="230" y2="66" stroke="#2a1d14" stroke-width="2"/><path d="M230,66 l18,5 l-18,5 z" fill="#c0392b"/>` +
    Array.from({ length: 7 }, (_, k) => `<path d="M${40 + k * 9},180 Q${44 + k * 9},120 ${52 + k * 10},${100 + (k % 3) * 8}" stroke="#4c6a2c" stroke-width="2.5" fill="none"/>`).join('') +
    Array.from({ length: 7 }, (_, k) => `<path d="M${560 - k * 9},180 Q${556 - k * 9},120 ${548 - k * 10},${104 + (k % 3) * 8}" stroke="#4c6a2c" stroke-width="2.5" fill="none"/>`).join(''),
  letter: () =>
    `<rect width="${W}" height="${H}" fill="#e7dbbf"/>` +
    Array.from({ length: 11 }, (_, k) => {
      const x = 520 - k * 40;
      const len = 60 + ((k * 53) % 70);
      return `<line x1="${x}" y1="24" x2="${x}" y2="${24 + len}" stroke="#2b2520" stroke-width="5" stroke-linecap="round" stroke-dasharray="9 5 4 6" opacity="0.75"/>`;
    }).join('') +
    `<rect x="84" y="118" width="34" height="34" fill="none" stroke="#b03a2e" stroke-width="3"/><rect x="92" y="126" width="18" height="18" fill="#b03a2e" opacity="0.8"/>`,
};

/** SVG markup for a story card's art, or '' for an unknown kind (the CSS gradient stays). */
export function cutArtSvg(kind: string): string {
  const scene = scenes[kind];
  return scene ? `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">${scene()}</svg>` : '';
}
