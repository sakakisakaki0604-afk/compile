import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, controller, objectiveHelpers } from '../public/js/engine/game.js';
import { MAP } from '../public/js/engine/legacy-map.js';
import { ENCOUNTERS, OBJECTIVES, FACTORY_CARDS, BONUS_TILES } from '../public/js/engine/cards.js';

const mk = () => createGame({
  players: [{ uid: 'a', faction: 'nordic', mat: 'industrial', combatCards: 1 }, { uid: 'b', faction: 'saxony', mat: 'agricultural', combatCards: 4 }],
  bonusTileId: BONUS_TILES[0].id, factoryIds: FACTORY_CARDS.slice(0, 3).map((f) => f.id),
});

test('盤面: 48ヘクス+本拠地5、トンネル6、遭遇11、湖7', () => {
  const hs = Object.values(MAP.hexes);
  assert.equal(hs.filter((h) => h.terrain !== 'home').length, 48);
  assert.equal(hs.filter((h) => h.tunnel).length, 6);
  assert.equal(hs.filter((h) => h.encounter).length, 11);
  assert.equal(hs.filter((h) => h.terrain === 'lake').length, 7);
  for (const f of Object.keys(MAP.homes)) assert.equal(MAP.startAdj[f].length, 2);
});
test('カード枚数', () => {
  assert.equal(ENCOUNTERS.length, 74); assert.equal(OBJECTIVES.length, 27); assert.equal(FACTORY_CARDS.length, 18);
  assert.ok(OBJECTIVES.every((o) => typeof o.check === 'function'));
});
test('ターンが回る', () => {
  let st = mk(); const first = st.turnUid;
  st = apply(st, first, { t: 'section', section: 0 }).state;
  st = apply(st, first, { t: 'top', kind: 'skip' }).state;
  st = apply(st, first, { t: 'endTurn' }).state;
  assert.notEqual(st.turnUid, first);
});
test('無料効果: 工場カード9(改良)で改良と人気度', () => {
  let st = mk(); const u = st.turnUid, p = st.players[u];
  p.factory = 'fac_09'; p.coins = 5; p.char = '0,0';
  st = apply(st, u, { t: 'section', section: 'factory' }).state;
  let r = apply(st, u, { t: 'top', kind: 'factory' }); st = r.state;
  assert.equal(st.players[u].coins, 3);
  assert.equal(st.pending.type, 'free');
  assert.throws(() => apply(st, u, { t: 'endTurn' }));
  st = apply(st, u, { t: 'free', kind: 'upgrade', slot: 'upgrade' }).state;
  assert.equal(st.pending, null); assert.equal(st.players[u].cubes, 1); assert.equal(st.players[u].coins, 3);
});
test('目的カード判定が例外を出さない', () => {
  const st = mk(); const u = st.turnUid;
  const h = objectiveHelpers(st, u);
  for (const o of OBJECTIVES) assert.equal(typeof o.check(st.players[u], h), 'boolean');
});
test('遭遇: 選べる選択肢がある間は見送れず、無料建設が処理される', () => {
  let st = mk(); const u = st.turnUid, p = st.players[u];
  const c = ENCOUNTERS.find((e) => e.options.some((o) => o.free.some((f) => f.k === 'anyRes')) && e.options.every((o) => !o.unsupported));
  const hex = p.char; st.hexes[hex].enc = true; p.pop = 10; p.coins = 10;
  st.turn.phase = 'moving'; st.pending = { type: 'encounter', hex, cardId: c.id };
  assert.throws(() => apply(st, u, { t: 'encounter', picks: [] }));
});
