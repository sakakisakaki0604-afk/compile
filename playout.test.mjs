import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, legalSections, moveTargets, controlled, RuleError } from '../public/js/engine/game.js';
import { ENCOUNTERS, FACTORY_CARDS, BONUS_TILES } from '../public/js/engine/cards.js';

const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (r, a) => a[Math.floor(r() * a.length)];

function play(seed) {
  const r = seeded(seed);
  let st = createGame({
    players: [{ uid: 'a', faction: 'nordic', mat: 'industrial', combatCards: 2 }, { uid: 'b', faction: 'saxony', mat: 'agricultural', combatCards: 2 }, { uid: 'c', faction: 'polania', mat: 'mechanical', combatCards: 2 }],
    bonusTileId: BONUS_TILES[0].id, factoryIds: FACTORY_CARDS.slice(0, 4).map((f) => f.id),
  });
  const RES = ['oil', 'metal', 'wood', 'food'];
  const tryA = (u, a) => { try { st = apply(st, u, a, r).state; return true; } catch (e) { if (e instanceof RuleError || e.name === 'RuleError') return false; throw e; } };
  for (let step = 0; step < 3000 && !st.over; step++) {
    const u = st.turnUid, p = st.players[u], pd = st.pending, ph = st.turn.phase;
    if (pd?.type === 'combat') { tryA(pd.attacker, { t: 'combat', att: { dial: 0, cards: [] }, def: { dial: 0, cards: [] } }); continue; }
    if (pd?.type === 'encounter') {
      if (!pd.cardId) { tryA(u, { t: 'encounterDraw', cardId: pick(r, ENCOUNTERS).id }); continue; }
      let ok = false; for (let i = 0; i < 3 && !ok; i++) ok = tryA(u, { t: 'encounter', picks: [i], payRes: [] });
      if (!ok) assert.ok(tryA(u, { t: 'encounter', picks: [] }) || true);
      continue;
    }
    if (pd?.type === 'factory') { tryA(u, { t: 'factory', cardId: st.factoryCandidates[0] }); continue; }
    if (pd?.type === 'free') {
      const h = pd.queue[0]; const kinds = h.alt || [h.k]; const hex = pick(r, controlled(st, u).filter((x) => st.players[u].workers.includes(x)).concat([p.char]));
      const ok = tryA(u, { t: 'free', kind: pick(r, kinds), hex, hexes: [hex], res: Array.from({ length: h.n || 0 }, () => pick(r, RES)), type: pick(r, ['monument', 'mill', 'mine', 'armory']), slot: pick(r, ['upgrade', 'deploy', 'build', 'enlist']), from: pick(r, ['upgrade', 'deploy', 'build', 'enlist']), bonus: pick(r, ['power', 'coins', 'pop', 'card']) });
      if (!ok) tryA(u, { t: 'free', skip: true });
      continue;
    }
    if (ph === 'section') { tryA(u, { t: 'section', section: pick(r, legalSections(st, u)) }); continue; }
    if (ph === 'top') {
      const hexes = controlled(st, u).filter((x) => p.workers.includes(x));
      const kind = p.section === 'factory' ? 'factory' : undefined;
      const tries = [
        { t: 'top', kind: 'move', mode: r() < 0.7 ? 'units' : 'coin' }, { t: 'top', kind: 'produce', hexes: hexes.slice(0, 2) },
        { t: 'top', kind: 'bolster', mode: 'power' }, { t: 'top', kind: 'trade', mode: 'pop' }, { t: 'top', kind: 'factory', payRes: [pick(r, RES), pick(r, RES)] },
      ];
      if (!tryA(u, pick(r, tries))) tryA(u, { t: 'top', kind: 'skip' });
      continue;
    }
    if (ph === 'moving') {
      const units = ['char', ...p.mechs.map((_, i) => `m${i}`), ...p.workers.map((_, i) => `w${i}`)];
      let moved = false;
      for (const unit of units.sort(() => r() - 0.5)) {
        const t = moveTargets(st, u, unit);
        if (t.length && tryA(u, { t: 'move', unit, to: pick(r, t).to })) { moved = true; break; }
      }
      if (!moved) tryA(u, { t: 'endMove' });
      else if (r() < 0.3) tryA(u, { t: 'endMove' });
      continue;
    }
    if (ph === 'bottom') {
      const hex = pick(r, controlled(st, u).concat([p.char]));
      const tries = [{ t: 'bottom', kind: 'upgrade', slot: 'upgrade' }, { t: 'bottom', kind: 'deploy', slot: Math.floor(r() * 4), hex }, { t: 'bottom', kind: 'build', type: pick(r, ['monument', 'mill', 'mine', 'armory']), hex }, { t: 'bottom', kind: 'enlist', from: 'upgrade', bonus: 'power' }, { t: 'bottom', kind: 'factoryMove' }];
      if (!tryA(u, pick(r, tries))) tryA(u, { t: 'bottom', kind: 'skip' });
      continue;
    }
    tryA(u, { t: 'endTurn' });
  }
  return st;
}
test('ランダムプレイを多数回しても例外が出ない', () => {
  for (let s = 1; s <= 40; s++) { const st = play(s); assert.ok(st.turnNo >= 1); }
});
