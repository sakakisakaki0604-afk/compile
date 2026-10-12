import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_FACTIONS, BASE_MATS, isLegalCombo, buildCombatDeck } from '../public/js/engine/data.js';
import { resolveDraft, validatePrefs, canMatch } from '../public/js/engine/draft.js';
import { validateChoice, resolveCombat, cardTotal, commitChoice } from '../public/js/engine/combat.js';
import { startBlockers, buildDecks } from '../public/js/engine/setup.js';

const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const F = Object.keys(BASE_FACTIONS);
const M = Object.keys(BASE_MATS);

test('CARD-02 戦闘カード分布 16/12/8/6=42', () => {
  const d = buildCombatDeck();
  assert.equal(d.length, 42);
  for (const [v, n] of [[2, 16], [3, 12], [4, 8], [5, 6]]) assert.equal(d.filter((c) => c.value === v).length, n);
  assert.equal(new Set(d.map((c) => c.id)).size, 42);
});

test('SET-02 禁止組み合わせ', () => {
  assert.equal(isLegalCombo('rusviet', 'industrial'), false);
  assert.equal(isLegalCombo('crimea', 'patriotic'), false);
  assert.equal(isLegalCombo('crimea', 'industrial'), true);
});

test('T-02 同順位の競合は競合者間だけで当選し、全員に割当される', () => {
  const players = ['a', 'b', 'c'];
  for (let s = 1; s <= 200; s++) {
    const prefs = { a: ['nordic', 'crimea'], b: ['nordic', 'saxony'], c: ['polania'] };
    const { assignments, log } = resolveDraft({ players, prefs, candidates: F, legal: () => true, rng: seeded(s) });
    assert.equal(assignments.c, 'polania');
    assert.ok(['a', 'b'].includes(log.find((l) => l.candidate === 'nordic').winner));
    assert.equal(new Set(Object.values(assignments)).size, 3);
  }
});

test('T-02 第1希望は第2希望より優先される', () => {
  const prefs = { a: ['crimea', 'nordic'], b: ['saxony', 'crimea'] };
  const { assignments } = resolveDraft({ players: ['a', 'b'], prefs, candidates: F, legal: () => true, rng: seeded(7) });
  assert.equal(assignments.a, 'crimea');
  assert.equal(assignments.b, 'saxony');
});

test('T-02 未割当は順位処理の後に残りから補完（希望なしでもよい）', () => {
  const { assignments } = resolveDraft({ players: ['a', 'b', 'c', 'd', 'e'], prefs: {}, candidates: F, legal: () => true });
  assert.equal(new Set(Object.values(assignments)).size, 5);
});

test('T-03 マット割当は禁止組み合わせを必ず避ける（5人全マット）', () => {
  const fac = { a: 'rusviet', b: 'crimea', c: 'nordic', d: 'saxony', e: 'polania' };
  const legal = (u, m) => isLegalCombo(fac[u], m);
  for (let s = 1; s <= 300; s++) {
    // 禁止マットを第1希望に出しても通らない
    const prefs = { a: ['industrial'], b: ['patriotic'] };
    assert.equal(validatePrefs(prefs.a, M, 'a', legal) !== null, true);
    const { assignments } = resolveDraft({ players: Object.keys(fac), prefs: {}, candidates: M, legal, rng: seeded(s) });
    for (const [u, m] of Object.entries(assignments)) assert.ok(isLegalCombo(fac[u], m), `${u}:${m}`);
    assert.equal(new Set(Object.values(assignments)).size, 5);
  }
});

test('希望を通すと他者の割当が不可能になる場合は通さない', () => {
  // x(rusviet)は industrial 不可。候補が industrial と engineering のみ。
  // y が engineering を希望しても、x の割当先がなくなるので通らない。
  const fac = { x: 'rusviet', y: 'nordic' };
  const legal = (u, m) => isLegalCombo(fac[u], m);
  const { assignments } = resolveDraft({
    players: ['x', 'y'], prefs: { y: ['engineering'] }, candidates: ['industrial', 'engineering'], legal, rng: seeded(3),
  });
  assert.equal(assignments.x, 'engineering');
  assert.equal(assignments.y, 'industrial');
  assert.equal(canMatch(['x'], ['industrial'], legal), false);
});

test('validatePrefs: 重複・4つ以上を拒否', () => {
  assert.ok(validatePrefs(['nordic', 'nordic'], F, 'a', () => true));
  assert.ok(validatePrefs(['nordic', 'crimea', 'saxony', 'polania'], F, 'a', () => true));
  assert.equal(validatePrefs([], F, 'a', () => true), null);
});

test('T-09 戦闘: 同点は攻撃側勝利・カード上限・手札検査', () => {
  const hand = [{ id: 'c1', value: 3 }, { id: 'c2', value: 5 }];
  assert.equal(validateChoice({ dial: 2, cardIds: ['c1'], units: 1, trackPower: 5, hand }), null);
  assert.ok(validateChoice({ dial: 6, cardIds: [], units: 1, trackPower: 5, hand }));
  assert.ok(validateChoice({ dial: 0, cardIds: ['c1', 'c2'], units: 1, trackPower: 5, hand }));
  assert.ok(validateChoice({ dial: 0, cardIds: ['zz'], units: 1, trackPower: 5, hand }));
  assert.ok(validateChoice({ dial: 8, cardIds: [], units: 1, trackPower: 20, hand }));
  assert.equal(cardTotal(['c1', 'c2'], hand), 8);
  const r = resolveCombat({ dial: 3, cardsValue: 2 }, { dial: 5, cardsValue: 0 });
  assert.equal(r.winner, 'attacker');
  assert.equal(resolveCombat({ dial: 1, cardsValue: 0 }, { dial: 2, cardsValue: 0 }).winner, 'defender');
});

test('戦闘コミットは値・ナンスが同じときだけ同一ハッシュ', async () => {
  const h1 = await commitChoice({ dial: 3, cardIds: ['c1'] }, 'n1');
  assert.equal(h1, await commitChoice({ dial: 3, cardIds: ['c1'] }, 'n1'));
  assert.notEqual(h1, await commitChoice({ dial: 4, cardIds: ['c1'] }, 'n1'));
});

test('CARD-01 未確認データがある間は開始不可／人数範囲', () => {
  assert.ok(startBlockers(3).length >= 4);
  assert.ok(startBlockers(1).some((m) => m.includes('2〜5')));
  const ok = { m: { label: 'x', expected: 1, entered: 1, verified: true } };
  assert.deepEqual(startBlockers(3, ok), []);
});

test('MAP-04 工場カード候補は人数+1枚', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `f${i + 1}`);
  for (const n of [2, 3, 4, 5]) assert.equal(buildDecks({ playerCount: n, factoryIds: ids }).factoryCandidates.length, n + 1);
});
