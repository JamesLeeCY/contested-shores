// Main-menu backdrop: an old-chart style map of Taiwan and Penghu as inline SVG.

/** Simplified coastline, clockwise from the northern tip (longitude, latitude). */
const TAIWAN: [number, number][] = [
  [121.53, 25.3], [121.75, 25.15], [121.93, 25.02], [121.85, 24.85], [121.83, 24.6], [121.6, 24.1], [121.5, 23.6],
  [121.4, 23.15], [121.2, 22.8], [120.95, 22.4], [120.87, 22.05], [120.83, 21.9], [120.7, 21.93], [120.62, 22.3],
  [120.45, 22.5], [120.28, 22.62], [120.15, 22.95], [120.08, 23.15], [120.15, 23.45], [120.25, 23.75], [120.4, 24.15],
  [120.6, 24.5], [120.85, 24.85], [121.05, 25.05], [121.3, 25.15], [121.45, 25.25],
];
const PENGHU: [number, number, number][] = [
  [119.58, 23.57, 9], [119.52, 23.62, 6], [119.66, 23.52, 5], [119.47, 23.42, 4], [119.6, 23.38, 4],
];
/** The Central Range, north to south. */
const SPINE: [number, number][] = [[121.45, 24.75], [121.25, 24.3], [121.05, 23.8], [120.95, 23.3], [120.9, 22.8], [120.85, 22.3]];

const K = 205;
const px = (lon: number) => 1060 + (lon - 119.5) * K;
const py = (lat: number) => 110 + (25.4 - lat) * K * 1.1;

export function menuBackdropSvg(): string {
  const coast = TAIWAN.map(([lo, la]) => `${px(lo).toFixed(0)},${py(la).toFixed(0)}`).join(' ');
  let grid = '';
  for (let lo = 119; lo <= 123; lo += 0.5) grid += `<line x1="${px(lo)}" y1="0" x2="${px(lo)}" y2="1000"/>`;
  for (let la = 21.5; la <= 26; la += 0.5) grid += `<line x1="0" y1="${py(la)}" x2="1600" y2="${py(la)}"/>`;
  let hatch = '';
  for (let i = 0; i < SPINE.length - 1; i++)
    for (let t = 0; t < 1; t += 0.2) {
      const x = px(SPINE[i][0] + (SPINE[i + 1][0] - SPINE[i][0]) * t);
      const y = py(SPINE[i][1] + (SPINE[i + 1][1] - SPINE[i][1]) * t);
      const s = 8 + ((i * 5 + t * 10) % 3) * 3;
      hatch += `<path d="M${x - s},${y + s * 0.5} L${x},${y - s * 0.6} L${x + s},${y + s * 0.5}"/>`;
    }
  const isles = PENGHU.map(([lo, la, r]) => `<circle cx="${px(lo)}" cy="${py(la)}" r="${r}"/>`).join('');
  const rose = `<g transform="translate(180,820)" stroke="#b89a5e" fill="none" stroke-width="1.5" opacity="0.7">
    <circle r="60"/><circle r="44"/><path d="M0,-80 L10,0 L0,80 L-10,0 Z M-80,0 L0,10 L80,0 L0,-10 Z" fill="#b89a5e" fill-opacity="0.25"/>
    <text y="-88" text-anchor="middle" fill="#b89a5e" stroke="none" font-size="18">N</text></g>`;
  return `<svg class="menu-bg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1600" height="1000" fill="#121c22"/>
    <g stroke="#b89a5e" stroke-opacity="0.12" stroke-width="1">${grid}</g>
    <polygon points="${coast}" fill="#b89a5e" fill-opacity="0.08" transform="translate(6,8)"/>
    <polygon points="${coast}" fill="#2e3326" stroke="#b89a5e" stroke-width="2" stroke-opacity="0.8"/>
    <g fill="#2e3326" stroke="#b89a5e" stroke-width="1.5" stroke-opacity="0.8">${isles}</g>
    <g fill="none" stroke="#8a7650" stroke-width="2" stroke-opacity="0.8">${hatch}</g>
    ${rose}
  </svg>`;
}
