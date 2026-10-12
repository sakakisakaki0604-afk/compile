// 盤面データ（公式盤面画像から読み取り）。board-data.js が元。ゲーム用の形式に変換する。
import { BOARD } from './board-data.js';

export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const RES = ['metal', 'oil', 'food', 'wood'];
export const TERRAIN_RES = { mountain: 'metal', tundra: 'oil', farm: 'food', forest: 'wood' };
export const PX = (q, r) => [520 + 121.2 * (q + r / 2), 468 + 105 * r]; // 盤面画像上の座標

const hexes = {}, ids = Object.keys(BOARD.terrain);
const tun = new Set(BOARD.tunnels.map(([q, r]) => `${q},${r}`)), enc = new Set(BOARD.enc.map(([q, r]) => `${q},${r}`));
for (const id of ids) {
  const [q, r] = id.split(',').map(Number);
  hexes[id] = { id, q, r, terrain: BOARD.terrain[id], tunnel: tun.has(id), encounter: enc.has(id), nb: [], river: [], home: null };
}
for (const h of Object.values(hexes)) h.nb = DIRS.map(([a, b]) => `${h.q + a},${h.r + b}`).filter((i) => hexes[i]);
for (const [a, b] of BOARD.rivers) {
  const ia = a.join(','), ib = b.join(',');
  if (hexes[ia] && hexes[ib]) { hexes[ia].river.push(ib); hexes[ib].river.push(ia); }
}
const BASE = ['nordic', 'rusviet', 'crimea', 'saxony', 'polania'];
const homes = {}, startAdj = {};
for (const f of BASE) {
  const hm = BOARD.homes[f], [x, y] = hm.px, hid = `home:${f}`;
  const r = (y - 468) / 105, q = (x - 520) / 121.2 - r / 2;
  hexes[hid] = { id: hid, q, r, terrain: 'home', tunnel: false, encounter: false, nb: [...hm.adj], river: [], home: f, px: [x, y] };
  hm.adj.forEach((n) => hexes[n].nb.push(hid));
  homes[f] = hid; startAdj[f] = [...hm.adj];
}
export const MAP = { ids: [...ids, ...BASE.map((f) => homes[f])], hexes, homes, startAdj };
export const isRiver = (a, b) => hexes[a].river.includes(b);
