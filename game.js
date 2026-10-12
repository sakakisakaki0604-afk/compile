// 大鎌戦役 ゲームエンジン（純粋関数）。state は JSON 化できるプレーンなオブジェクト。
// 根拠: 公式ルールブック v1.6 の本文（手番・各アクション・戦闘・星・得点）と、仕様書/カード調査資料。
// ★仮データ（マップ・遭遇・目的・工場・ボーナスタイル）に依存する箇所は placeholder.js / map.js を参照。

import { MAP, RES, TERRAIN_RES, isRiver } from './legacy-map.js';
import {
  BASE_FACTIONS, BASE_MATS, MAT_NUMBER, MECH_SLOTS, RIVERWALK, BOTTOM_ORDER, BOTTOM_RES,
  RECRUIT_ONETIME, RECRUIT_ONGOING, topOf, structOf,
} from './data.js';
import { ENCOUNTERS, OBJECTIVES, FACTORY_CARDS, BONUS_TILES, byId } from './cards.js';

export class RuleError extends Error {}
const fail = (m) => { throw new RuleError(m); };

export const POWER_MAX = 16, POP_MAX = 18, STAR_MAX = 6;
const STRUCTS = ['monument', 'mill', 'mine', 'armory'];

// ------------------------------------------------------------------ 生成
export function createGame({ players, bonusTileId, factoryIds, gid = 'g0' }) {
  const order = [...players].sort((a, b) => MAT_NUMBER[a.mat] - MAT_NUMBER[b.mat]).map((p) => p.uid);
  const st = {
    v: 1, gid, order, turnUid: order[0], turnNo: 1, over: false, result: null,
    bonusTile: bonusTileId, factoryCandidates: [...factoryIds], log: [], hexes: {}, players: {},
    turn: { phase: 'section' }, pending: null,
  };
  for (const id of MAP.ids) st.hexes[id] = { res: {}, structure: null, enc: MAP.hexes[id].encounter };
  for (const { uid, faction, mat } of players) {
    const f = BASE_FACTIONS[faction], m = BASE_MATS[mat];
    st.players[uid] = {
      faction, mat, power: f.power, pop: m.popularity, coins: m.coins, hand: f.combatCards, objs: m.objectives,
      section: null, last: null, char: MAP.homes[faction], mechs: [], workers: [...MAP.startAdj[faction]], matWorkers: 6,
      red: { upgrade: 0, deploy: 0, build: 0, enlist: 0 }, cubes: 0, structures: [], recruits: [],
      stars: [], combatWins: 0, factory: null,
    };
  }
  log(st, order[0], 'ゲーム開始');
  return st;
}

function log(st, uid, text) {
  st.log.push({ n: st.turnNo, uid, text });
  if (st.log.length > 200) st.log.shift();
}

// ------------------------------------------------------------------ 参照ヘルパー
export const H = (id) => MAP.hexes[id];
export const homeOf = (st, uid) => MAP.homes[st.players[uid].faction];

export function unitsAt(st, hex) {
  const out = {};
  const add = (uid, k) => { (out[uid] ||= { char: false, mechs: 0, workers: 0 }); if (k === 'char') out[uid].char = true; else out[uid][k]++; };
  for (const [uid, p] of Object.entries(st.players)) {
    if (p.char === hex) add(uid, 'char');
    for (const m of p.mechs) if (m.hex === hex) add(uid, 'mechs');
    for (const w of p.workers) if (w === hex) add(uid, 'workers');
  }
  return out;
}
export function controller(st, hex) {
  const u = Object.keys(unitsAt(st, hex));
  if (u.length === 1) return u[0];
  if (u.length > 1) return null;
  return st.hexes[hex].structure?.owner ?? null;
}
export const controlled = (st, uid) => MAP.ids.filter((h) => controller(st, h) === uid && H(h).terrain !== 'home');
export const hasAbility = (st, uid, ab) => {
  const p = st.players[uid];
  return p.mechs.some((m) => MECH_SLOTS[p.faction][m.slot] === ab);
};
export const resTotals = (st, uid) => {
  const t = { oil: 0, metal: 0, wood: 0, food: 0 };
  for (const h of controlled(st, uid)) for (const r of RES) t[r] += st.hexes[h].res[r] || 0;
  return t;
};
const myWorkersAt = (st, uid, hex) => st.players[uid].workers.filter((w) => w === hex).length;

// ------------------------------------------------------------------ 資源・支払い・獲得
function takeRes(st, uid, type, n) {
  let need = n;
  for (const h of controlled(st, uid)) {
    const have = st.hexes[h].res[type] || 0;
    const t = Math.min(have, need);
    if (t) { st.hexes[h].res[type] -= t; need -= t; }
    if (!need) return;
  }
  fail(`${type}が足りません`);
}
const total = (st, uid, type) => resTotals(st, uid)[type];

export function canPay(st, uid, cost) {
  const p = st.players[uid];
  for (const [k, v] of Object.entries(cost || {})) {
    if (k === 'coins' && p.coins < v) return false;
    if (k === 'power' && p.power < v) return false;
    if (k === 'pop' && p.pop < v) return false;
    if (RES.includes(k) && total(st, uid, k) < v) return false;
  }
  return true;
}
function pay(st, uid, cost) {
  if (!canPay(st, uid, cost)) fail('コストを支払えません');
  const p = st.players[uid];
  for (const [k, v] of Object.entries(cost || {})) {
    if (k === 'coins') p.coins -= v;
    else if (k === 'power') p.power -= v;
    else if (k === 'pop') p.pop -= v;
    else if (RES.includes(k)) takeRes(st, uid, k, v);
  }
}
// 獲得。資源・ワーカーは hex に置く
function gain(st, uid, g, hex, ctx) {
  const p = st.players[uid];
  for (const [k, v] of Object.entries(g || {})) {
    if (k === 'coins') p.coins += v;
    else if (k === 'power') p.power = Math.min(POWER_MAX, p.power + v);
    else if (k === 'pop') p.pop = Math.min(POP_MAX, p.pop + v);
    else if (k === 'card') grantCards(st, uid, v, ctx);
    else if (RES.includes(k)) st.hexes[hex].res[k] = (st.hexes[hex].res[k] || 0) + v;
    else if (k === 'worker') { for (let i = 0; i < v && p.matWorkers > 0; i++) { p.matWorkers--; p.workers.push(hex); } }
  }
}
function grantCards(st, uid, n, ctx) {
  st.players[uid].hand += n;
  ctx.grants[uid] = (ctx.grants[uid] || 0) + n;
}
const losePop = (st, uid, n) => { const p = st.players[uid]; p.pop = Math.max(0, p.pop - n); };

// ------------------------------------------------------------------ 移動
const topo = (st, uid, hex) => {
  // トンネル網: トンネル領土と自分の鉱山は互いに隣接
  const p = st.players[uid];
  const inNet = (h) => H(h).tunnel || p.structures.some((s) => s.type === 'mine' && s.hex === h);
  if (!inNet(hex)) return [];
  return MAP.ids.filter((h) => h !== hex && inNet(h));
};

export function unitHex(st, uid, unit) {
  const p = st.players[uid];
  if (unit === 'char') return p.char;
  if (unit[0] === 'm') return p.mechs[+unit.slice(1)]?.hex;
  if (unit[0] === 'w') return p.workers[+unit.slice(1)];
  return undefined;
}
function setUnitHex(st, uid, unit, hex) {
  const p = st.players[uid];
  if (unit === 'char') p.char = hex;
  else if (unit[0] === 'm') p.mechs[+unit.slice(1)].hex = hex;
  else p.workers[+unit.slice(1)] = hex;
}

/** 1ユニットの移動先候補 [{to, steps}] */
export function moveTargets(st, uid, unit, stepsAllowed) {
  const p = st.players[uid];
  const from = unitHex(st, uid, unit);
  if (!from) return [];
  const isWorker = unit[0] === 'w';
  const maxSteps = stepsAllowed ?? (isWorker ? 1 : 1 + (hasAbility(st, uid, 'speed') ? 1 : 0));
  const rw = hasAbility(st, uid, 'riverwalk') ? RIVERWALK[p.faction] : [];
  const seen = new Map([[from, 0]]);
  const out = [];
  let frontier = [from];
  for (let s = 1; s <= maxSteps; s++) {
    const next = [];
    for (const cur of frontier) {
      // 途中経由は、敵ユニット・遭遇トークンのある領土では不可
      const nbs = new Set([...H(cur).nb, ...topo(st, uid, cur)]);
      for (const c of nbs) {
        if (seen.has(c)) continue;
        const ch = H(c);
        if (ch.terrain === 'lake') continue;
        if (ch.terrain === 'home' && ch.home !== p.faction) continue;
        const viaTunnel = !H(cur).nb.includes(c);
        if (!viaTunnel && isRiver(cur, c)) {
          const ok = isWorker ? p.faction === 'nordic' : rw.includes(ch.terrain);
          if (!ok) continue;
        }
        const here = unitsAt(st, c);
        const enemies = Object.keys(here).filter((u) => u !== uid);
        if (isWorker && enemies.length) continue; // ワーカーは敵のいる領土へ入れない
        seen.set(c, s);
        out.push({ to: c, steps: s });
        const stops = enemies.length || st.hexes[c].enc;
        if (!stops) next.push(c);
      }
    }
    frontier = next;
  }
  return out;
}

// ------------------------------------------------------------------ 手番
const sectionTop = (p, s) => (s === 'factory' ? 'factory' : topOf(p.mat, s));
const sectionBottom = (p, s) => (s === 'factory' ? 'factoryMove' : BOTTOM_ORDER[s]);

export function legalSections(st, uid) {
  const p = st.players[uid];
  const all = [0, 1, 2, 3, ...(p.factory ? ['factory'] : [])];
  return all.filter((s) => s !== p.last || p.faction === 'rusviet');
}

function startMove(st, uid, kind) {
  const t = st.turn;
  t.move = { kind, left: kind === 'factoryMove' ? 2 : 2, moved: [], single: null, idx: 0 };
  t.phase = 'moving';
}

function ensureTurn(st, uid) {
  if (st.over) fail('ゲームは終了しています');
  if (st.turnUid !== uid) fail('あなたの手番ではありません');
}

export function apply(stIn, uid, action, rng = Math.random) {
  const st = structuredClone(stIn);
  const ctx = { grants: {}, discards: {}, events: [] };
  ensureTurn(st, uid); // combat 以外は手番プレイヤーのみ
  const p = st.players[uid];
  const t = st.turn;
  const a = action;
  const phase = t.phase;

  if (st.pending?.type === 'free' && a.t !== 'free') fail('無料効果の処理が残っています');
  switch (a.t) {
    case 'free': {
      if (!st.pending || st.pending.type !== 'free') fail('無料効果はありません');
      doFree(st, uid, a, ctx);
      break;
    }
    case 'section': {
      if (phase !== 'section') fail('すでにセクションを選んでいます');
      if (!legalSections(st, uid).includes(a.section)) fail('そのセクションは選べません（前回と別のセクションを選びます）');
      p.last = p.section; p.section = a.section;
      t.phase = 'top'; t.topTaken = false;
      log(st, uid, `セクション${a.section === 'factory' ? '（工場）' : a.section + 1}を選択`);
      break;
    }
    case 'top': {
      if (phase !== 'top') fail('今は上段アクションを選べません');
      topAction(st, uid, a, ctx);
      break;
    }
    case 'move': {
      if (phase !== 'moving') fail('今は移動できません');
      doMove(st, uid, a, ctx);
      break;
    }
    case 'endMove': {
      if (phase !== 'moving') fail('移動中ではありません');
      finishMove(st, uid, ctx);
      break;
    }
    case 'combat': {
      if (!st.pending || st.pending.type !== 'combat') fail('戦闘はありません');
      doCombat(st, uid, a, ctx);
      break;
    }
    case 'encounterDraw': {
      if (!st.pending || st.pending.type !== 'encounter' || st.pending.cardId) fail('遭遇を引けません');
      if (!byId(ENCOUNTERS, a.cardId)) fail('不明な遭遇カードです');
      st.pending.cardId = a.cardId;
      break;
    }
    case 'encounter': {
      if (!st.pending || st.pending.type !== 'encounter' || !st.pending.cardId) fail('遭遇はありません');
      doEncounter(st, uid, a, ctx);
      break;
    }
    case 'factory': {
      if (!st.pending || st.pending.type !== 'factory') fail('工場カードの選択ではありません');
      if (!st.factoryCandidates.includes(a.cardId)) fail('その工場カードは選べません');
      p.factory = a.cardId;
      st.factoryCandidates = st.factoryCandidates.filter((c) => c !== a.cardId);
      st.pending = null;
      log(st, uid, `工場カード「${byId(FACTORY_CARDS, a.cardId).name}」を獲得`);
      settle(st, uid, ctx);
      break;
    }
    case 'bottom': {
      if (phase !== 'bottom') fail('今は下段アクションを選べません');
      if (!t.topTaken) fail('下段アクションは上段アクションを行った後にのみ実行できます');
      bottomAction(st, uid, a, ctx);
      break;
    }
    case 'objective': {
      if (st.pending || phase === 'moving') fail('処理中は宣言できません');
      doObjective(st, uid, a, ctx);
      break;
    }
    case 'endTurn': {
      if (phase === 'section') fail('セクションを選んでから終了します（何もしない場合もセクションは動かします）');
      if (phase === 'moving' || st.pending) fail('処理中の項目があります');
      if (phase === 'top') log(st, uid, '上段アクションを行わない');
      endTurn(st, uid, ctx);
      break;
    }
    default: fail('不明な操作です');
  }
  awardStars(st, uid);
  return { state: st, ...ctx };
}

// ---- 上段 ----
function topAction(st, uid, a, ctx) {
  const p = st.players[uid], t = st.turn;
  const kind = sectionTop(p, p.section);
  if (a.kind === 'skip') { t.phase = 'end'; log(st, uid, '上段アクションを行わない'); return; }
  if (a.kind !== kind) fail('このセクションの上段アクションではありません');
  const done = () => { t.topTaken = true; t.phase = 'bottom'; };
  if (kind === 'move') {
    if (a.mode === 'coin') { p.coins += 1; log(st, uid, 'コイン+1（移動の代わり）'); done(); return; }
    t.topTaken = true; startMove(st, uid, 'move'); log(st, uid, '移動アクション'); return;
  }
  if (kind === 'bolster') {
    pay(st, uid, { coins: 1 });
    if (a.mode === 'card') grantCards(st, uid, 1, ctx); else p.power = Math.min(POWER_MAX, p.power + 2);
    if (p.structures.some((s) => s.type === 'monument')) p.pop = Math.min(POP_MAX, p.pop + 1);
    log(st, uid, `鼓舞: ${a.mode === 'card' ? '戦闘カード+1' : 'パワー+2'}`); done(); return;
  }
  if (kind === 'trade') {
    pay(st, uid, { coins: 1 });
    if (a.mode === 'pop') p.pop = Math.min(POP_MAX, p.pop + 1);
    else {
      const picks = a.res || [];
      if (picks.length !== 2) fail('資源を2つ選んでください');
      for (const { type, hex } of picks) {
        if (!RES.includes(type)) fail('不正な資源');
        if (controller(st, hex) !== uid || !myWorkersAt(st, uid, hex)) fail('資源は自分のワーカーがいる支配領土に置きます');
        st.hexes[hex].res[type] = (st.hexes[hex].res[type] || 0) + 1;
      }
    }
    if (p.structures.some((s) => s.type === 'armory')) p.power = Math.min(POWER_MAX, p.power + 1);
    log(st, uid, `交易: ${a.mode === 'pop' ? '人気度+1' : '資源+2'}`); done(); return;
  }
  if (kind === 'produce') { doProduce(st, uid, a.hexes, ctx); done(); return; }
  if (kind === 'factory') {
    const card = byId(FACTORY_CARDS, p.factory);
    payCost(st, uid, card.cost, a, ctx);
    const hex = a.hex || p.char;
    if (card.gain.worker && controller(st, hex) !== uid) fail('ワーカーは自分が支配する領土に置きます');
    gain(st, uid, card.gain, hex, ctx);
    log(st, uid, `工場「${card.name}」`); done();
    enqueueFree(st, hex, card.free, null);
    return;
  }
}

// ---- 移動 ----
function doMove(st, uid, a, ctx) {
  const p = st.players[uid], mv = st.turn.move;
  const unit = a.unit;
  if (mv.kind === 'move' && mv.moved.includes(unit)) fail('同じユニットは1回の移動アクションで1度だけです');
  if (mv.kind === 'factoryMove') { if (mv.single && mv.single !== unit) fail('工場の移動は同じユニットを2回まで'); }
  const allow = mv.kind === 'factoryMove'
    ? (mv.idx === 0 && unit[0] !== 'w' && hasAbility(st, uid, 'speed') ? 2 : 1)
    : undefined;
  const from = unitHex(st, uid, unit);
  const cand = moveTargets(st, uid, unit, allow).find((c) => c.to === a.to);
  if (!cand) fail('そこへは移動できません');
  // 運搬
  for (const [r, n] of Object.entries(a.carry || {})) {
    if (!RES.includes(r) || !Number.isInteger(n) || n < 0) fail('不正な運搬指定');
    if ((st.hexes[from].res[r] || 0) < n) fail('その資源は領土にありません');
    st.hexes[from].res[r] -= n; st.hexes[a.to].res[r] = (st.hexes[a.to].res[r] || 0) + n;
  }
  const before = unitsAt(st, a.to);
  setUnitHex(st, uid, unit, a.to);
  mv.moved.push(unit); mv.single = mv.kind === 'factoryMove' ? unit : null; mv.idx++; mv.left--;
  const fighter = unit[0] !== 'w';
  let stop = false;
  const enemies = Object.keys(before).filter((u) => u !== uid);
  if (fighter && enemies.length) {
    const defender = enemies.find((u) => before[u].char || before[u].mechs);
    if (defender) { st.turn.combatWith = { hex: a.to, defender }; stop = true; }
    else {
      // ワーカーのみ → 退却、人気度を失う
      let forced = 0;
      for (const e of enemies) {
        const ep = st.players[e];
        ep.workers = ep.workers.map((w) => { if (w === a.to) { forced++; return homeOf(st, e); } return w; });
      }
      if (!hasAbility(st, uid, 'camaraderie')) losePop(st, uid, forced);
      log(st, uid, `ワーカー${forced}人を退却させた`);
    }
  }
  if (unit === 'char' && st.hexes[a.to].enc) stop = true;
  log(st, uid, `${unit === 'char' ? 'キャラクター' : unit[0] === 'm' ? 'メック' : 'ワーカー'}が移動`);
  if (stop || mv.left <= 0) finishMove(st, uid, ctx);
}

function finishMove(st, uid, ctx) {
  const cw = st.turn.combatWith;
  st.turn.move = null;
  if (cw) {
    st.turn.combatWith = null;
    const defU = unitsAt(st, cw.hex);
    st.combatSeq = (st.combatSeq || 0) + 1;
    st.pending = {
      type: 'combat', seq: st.combatSeq, key: `${st.gid}_${st.combatSeq}`, hex: cw.hex, attacker: uid, defender: cw.defender,
      attUnits: (defU[uid]?.char ? 1 : 0) + (defU[uid]?.mechs || 0),
      defUnits: (defU[cw.defender]?.char ? 1 : 0) + (defU[cw.defender]?.mechs || 0),
    };
    return;
  }
  settle(st, uid, ctx);
}

// 移動・戦闘・遭遇・工場の処理が終わるたびに呼ばれ、次に処理すべきものがあれば pending にする
function settle(st, uid, ctx) {
  const p = st.players[uid], t = st.turn;
  if (st.pending) return;
  if (st.hexes[p.char].enc) {
    st.pending = { type: 'encounter', hex: p.char, cardId: null };
    return;
  }
  if (p.char === '0,0' && !p.factory && st.factoryCandidates.length && !t.factoryOffered) {
    st.pending = { type: 'factory' };
    t.factoryOffered = true;
    return;
  }
  t.phase = t.afterMove === 'bottom' ? 'end' : 'bottom';
}

// ---- 戦闘 ----
function doCombat(st, uid, a, ctx) {
  const pd = st.pending;
  if (uid !== pd.attacker) fail('戦闘の解決は攻撃側が行います');
  const sides = { att: pd.attacker, def: pd.defender };
  const choice = {};
  for (const k of ['att', 'def']) {
    const c = a[k], pl = st.players[sides[k]];
    if (!c || !Number.isInteger(c.dial) || c.dial < 0) fail('ダイヤルが不正です');
    if (c.dial > Math.min(7, pl.power)) fail('ダイヤルはパワー以下・7以下です');
    const cards = c.cards || [];
    if (cards.length > (k === 'att' ? pd.attUnits : pd.defUnits)) fail('戦闘カードは関与ユニット数までです');
    if (cards.length > pl.hand) fail('手札が足りません');
    if (!cards.every((v) => [2, 3, 4, 5].includes(v))) fail('不正な戦闘カード');
    choice[k] = { dial: c.dial, cards, sum: c.dial + cards.reduce((s, v) => s + v, 0) };
  }
  const attWins = choice.att.sum >= choice.def.sum;
  const winner = attWins ? pd.attacker : pd.defender, loser = attWins ? pd.defender : pd.attacker;
  const lp = st.players[loser], wp = st.players[winner];
  for (const k of ['att', 'def']) {
    const pl = st.players[sides[k]];
    pl.power = Math.max(0, pl.power - choice[k].dial);
    pl.hand -= choice[k].cards.length;
    for (const v of choice[k].cards) ctx.discards[v] = (ctx.discards[v] || 0) + 1;
  }
  // 敗者の退却
  let workersForced = 0;
  if (lp.char === pd.hex) lp.char = homeOf(st, loser);
  lp.mechs.forEach((m) => { if (m.hex === pd.hex) m.hex = homeOf(st, loser); });
  lp.workers = lp.workers.map((w) => { if (w === pd.hex) { workersForced++; return homeOf(st, loser); } return w; });
  if (attWins && workersForced && !hasAbility(st, winner, 'camaraderie')) losePop(st, winner, workersForced);
  const revealed = choice[loser === pd.attacker ? 'att' : 'def'];
  if (revealed.sum > 0) grantCards(st, loser, 1, ctx);
  // 勝者の星（最大2、ザクソンは無制限）
  const maxStars = wp.faction === 'saxony' ? Infinity : 2;
  if (wp.combatWins < maxStars) { wp.combatWins++; addStar(st, winner, `combat${wp.combatWins}`); }
  log(st, winner, `戦闘に勝利（${choice.att.sum} 対 ${choice.def.sum}）`);
  st.lastCombat = { hex: pd.hex, att: choice.att, def: choice.def, winner };
  st.pending = null;
  settle(st, uid, ctx);
}

// ---- 遭遇 ----
// 費用支払い（戦闘カード・任意資源を含む）。戦闘カードは手札から価値の低い順に捨てる（net.js 側で処理）。
function payCost(st, uid, cost, a, ctx) {
  const p = st.players[uid];
  const { card = 0, anyRes = 0, diff, ...rest } = cost || {};
  if (p.hand < card) fail('戦闘カードが足りません');
  const types = (a && a.payRes) || [];
  if (anyRes) {
    if (types.length !== anyRes) fail(`支払う資源を${anyRes}個選んでください`);
    if (diff && new Set(types).size !== types.length) fail('異なる種類の資源を選んでください');
    for (const ty of types) if (!RES.includes(ty)) fail('不正な資源');
  }
  const need = { ...rest }; for (const ty of types) need[ty] = (need[ty] || 0) + 1;
  pay(st, uid, need);
  if (card) { p.hand -= card; ctx.cardPays = (ctx.cardPays || 0) + card; }
}

function enqueueFree(st, hex, items, after) {
  if (!items.length) return false;
  st.pending = { type: 'free', queue: items.map((x) => ({ ...x })), hex, after };
  return true;
}

function doProduce(st, uid, hexes, ctx) {
  const p = st.players[uid];
  hexes = [...new Set(hexes || [])];
  if (!hexes.length || hexes.length > 2) fail('生産する領土は1〜2か所です');
  for (const h of hexes) {
    if (controller(st, h) !== uid) fail('支配している領土で生産します');
    const mill = p.structures.some((s) => s.type === 'mill' && s.hex === h) ? 1 : 0;
    const n = myWorkersAt(st, uid, h) + mill;
    if (!n) fail('ワーカーのいない領土では生産できません');
    const terr = H(h).terrain;
    if (terr === 'village') gain(st, uid, { worker: n }, h, ctx);
    else if (TERRAIN_RES[terr]) st.hexes[h].res[TERRAIN_RES[terr]] = (st.hexes[h].res[TERRAIN_RES[terr]] || 0) + n;
    else fail('この地形では生産できません');
  }
  log(st, uid, `生産（${hexes.length}か所）`);
}

// 無料効果（遭遇・工場カード由来）。キューの先頭を1つ処理する。skip で放棄できる。
function doFree(st, uid, a, ctx) {
  const pd = st.pending, head = pd.queue[0], p = st.players[uid];
  if (a.skip) { log(st, uid, '無料効果を行わない'); }
  else {
    const kind = a.kind;
    if (head.alt ? !head.alt.includes(kind) : head.k !== kind) fail('その効果は今は選べません');
    if (['build', 'upgrade', 'deploy', 'enlist'].includes(kind)) runBottom(st, uid, kind, a, ctx, true);
    else if (kind === 'produce') doProduce(st, uid, a.hexes, ctx);
    else if (kind === 'anyRes') {
      const types = a.res || [];
      if (types.length !== head.n) fail(`資源を${head.n}個選んでください`);
      const hex = a.hex || pd.hex;
      if (controller(st, hex) !== uid) fail('資源は自分が支配する領土に置きます');
      for (const ty of types) { if (!RES.includes(ty)) fail('不正な資源'); st.hexes[hex].res[ty] = (st.hexes[hex].res[ty] || 0) + 1; }
      log(st, uid, `資源${head.n}個を獲得`);
    } else fail('不明な効果です');
  }
  pd.queue.shift();
  if (!pd.queue.length) { st.pending = null; if (pd.after === 'settle') settle(st, uid, ctx); }
}

function doEncounter(st, uid, a, ctx) {
  const p = st.players[uid], pd = st.pending;
  const card = byId(ENCOUNTERS, pd.cardId);
  const picks = a.picks || [];
  const max = p.faction === 'polania' ? 2 : 1;
  if (picks.length > max) fail(`選択肢は${max}つまでです`);
  if (new Set(picks).size !== picks.length) fail('同じ選択肢は選べません');
  if (!picks.length && card.options.some((o) => !o.unsupported && canPay(st, uid, o.cost))) fail('選べる選択肢があります');
  const items = [];
  for (const i of picks) {
    const opt = card.options[i];
    if (!opt) fail('不正な選択肢');
    if (opt.unsupported) fail('この選択肢はまだ実装されていません');
    payCost(st, uid, opt.cost, a, ctx);
    gain(st, uid, opt.gain, pd.hex, ctx);
    items.push(...opt.free);
  }
  st.hexes[pd.hex].enc = false;
  log(st, uid, picks.length ? `遭遇#${card.no}を解決` : `遭遇#${card.no}：選べる選択肢がなく見送り`);
  st.pending = null;
  if (!enqueueFree(st, pd.hex, items, 'settle')) settle(st, uid, ctx);
}

// ---- 下段 ----
function bottomAction(st, uid, a, ctx) {
  const p = st.players[uid], t = st.turn;
  const kind = sectionBottom(p, p.section);
  if (a.kind === 'skip') { t.phase = 'end'; log(st, uid, '下段アクションを行わない'); return; }
  if (kind === 'factoryMove') {
    if (a.kind !== 'factoryMove') fail('工場セクションの下段は移動です');
    t.afterMove = 'bottom'; startMove(st, uid, 'factoryMove'); log(st, uid, '工場の移動'); return;
  }
  if (a.kind !== kind) fail('このセクションの下段アクションではありません');
  runBottom(st, uid, kind, a, ctx, false);
  t.phase = 'end';
}

// 下段アクションの本体。free=true は遭遇・工場カードによる無料実行（費用・コイン・徴兵常時ボーナスなし）
function runBottom(st, uid, kind, a, ctx, free) {
  const p = st.players[uid];
  const m = BASE_MATS[p.mat].lower[kind];
  const cost = Math.max(0, m[0] - p.red[kind]);
  const res = BOTTOM_RES[kind];
  const needPay = free ? {} : { [res]: cost };
  const hexOk = (h) => {
    if (!h || !H(h)) fail('領土を選んでください');
    if (controller(st, h) !== uid || !myWorkersAt(st, uid, h)) fail('ワーカーのいる支配領土を選んでください');
    if (['lake', 'home'].includes(H(h).terrain)) fail('湖と本拠地には置けません');
  };
  if (kind === 'upgrade') {
    if (p.cubes >= 6) fail('改良はすべて完了しています');
    const slot = a.slot;
    if (!BOTTOM_ORDER.includes(slot)) fail('改良先を選んでください');
    if (p.red[slot] >= BASE_MATS[p.mat].lower[slot][1]) fail('その欄はこれ以上改良できません');
    pay(st, uid, needPay);
    p.red[slot]++; p.cubes++;
    log(st, uid, `改良（${slot}のコスト-1）`);
  } else if (kind === 'deploy') {
    if (p.mechs.length >= 4) fail('メックはすべて配備済みです');
    const slot = a.slot;
    if (!(slot >= 0 && slot <= 3) || p.mechs.some((x) => x.slot === slot)) fail('配備するメックを選んでください');
    hexOk(a.hex);
    pay(st, uid, needPay);
    p.mechs.push({ slot, hex: a.hex });
    log(st, uid, `メック配備（${MECH_SLOTS[p.faction][slot]}）`);
  } else if (kind === 'build') {
    const type = a.type;
    if (!STRUCTS.includes(type) || p.structures.some((s) => s.type === type)) fail('建設する建物を選んでください');
    hexOk(a.hex);
    if (st.hexes[a.hex].structure) fail('その領土にはすでに建物があります');
    pay(st, uid, needPay);
    st.hexes[a.hex].structure = { owner: uid, type };
    p.structures.push({ type, hex: a.hex });
    log(st, uid, `${type}を建設`);
  } else if (kind === 'enlist') {
    if (p.recruits.length >= 4) fail('徴兵はすべて完了しています');
    const from = a.from, bonus = a.bonus;
    if (!BOTTOM_ORDER.includes(from) || p.recruits.some((r) => r.section === from)) fail('徴兵トークンの取得元を選んでください');
    if (!RECRUIT_ONETIME.includes(bonus) || p.recruits.some((r) => r.bonus === bonus)) fail('一時ボーナスの空きを選んでください');
    pay(st, uid, needPay);
    p.recruits.push({ section: from, bonus });
    gain(st, uid, { [bonus === 'card' ? 'card' : bonus]: 2 }, p.char, ctx);
    log(st, uid, `徴兵（一時ボーナス: ${bonus}）`);
  }
  if (free) return;
  p.coins += m[2];
  // 常時ボーナス: 行動者 → 左 → 右（2人戦では1回）
  const i = st.order.indexOf(uid), n = st.order.length;
  const chain = [...new Set([uid, st.order[(i + 1) % n], st.order[(i + n - 1) % n]])];
  for (const u of chain) {
    for (const r of st.players[u].recruits) if (r.section === kind) gain(st, u, RECRUIT_ONGOING[kind], st.players[u].char, ctx);
  }
}

// ---- 目的 ----
export function objectiveHelpers(st, uid) {
  const p = st.players[uid];
  const cs = controlled(st, uid);
  const rt = resTotals(st, uid);
  const count = { mountain: 0, farm: 0, tundra: 0, forest: 0, village: 0 };
  for (const h of cs) if (count[H(h).terrain] !== undefined) count[H(h).terrain]++;
  const prod = new Set(cs.filter((h) => TERRAIN_RES[H(h).terrain] && myWorkersAt(st, uid, h)).map((h) => H(h).terrain));
  const at = (h) => ({ char: p.char === h, mech: p.mechs.some((m) => m.hex === h), worker: p.workers.includes(h) });
  return {
    controlled: cs.length + (cs.includes('0,0') ? 2 : 0), cs, rt, count, at,
    resAt: (h) => Object.values(st.hexes[h].res).reduce((x, v) => x + v, 0),
    prodTypes: prod.size,
    charAtHome: H(p.char).terrain === 'home',
    factoryAdjWorkers: p.workers.filter((w) => H('0,0').nb.includes(w)).length,
    structNearHome: p.structures.some((s) => H(s.hex).nb.some((n) => H(n).terrain === 'home')),
    workers: p.workers.length, structures: p.structures.length,
    resTotal: Object.values(rt).reduce((x, v) => x + v, 0),
    hasFactory: cs.includes('0,0'), hasLake: cs.some((h) => H(h).terrain === 'lake'),
    mountains: count.mountain, farms: count.farm,
  };
}
function doObjective(st, uid, a, ctx) {
  const p = st.players[uid];
  const card = byId(OBJECTIVES, a.cardId);
  if (!card) fail('不明な目的カードです');
  if (p.objs <= 0) fail('目的カードを持っていません');
  const key = !p.stars.includes('objective') ? 'objective' : p.faction === 'saxony' && !p.stars.includes('objective2') ? 'objective2' : null;
  if (!key) fail('目的の星はこれ以上置けません');
  if (!card.check({ ...p, cubes: p.cubes }, objectiveHelpers(st, uid))) fail('目的を達成していません');
  p.objs--;
  addStar(st, uid, key);
  log(st, uid, `目的「${card.name}」を達成`);
}

// ------------------------------------------------------------------ 星・終了・得点
function addStar(st, uid, key) {
  const p = st.players[uid];
  if (p.stars.includes(key) || p.stars.length >= STAR_MAX) return;
  p.stars.push(key);
  log(st, uid, `星を獲得（${key}）`);
  if (p.stars.length >= STAR_MAX && !st.over) { st.over = true; st.result = computeScores(st); }
}
function awardStars(st, uid) {
  for (const [u, p] of Object.entries(st.players)) {
    if (p.cubes >= 6) addStar(st, u, 'upgrades');
    if (p.mechs.length >= 4) addStar(st, u, 'mechs');
    if (p.structures.length >= 4) addStar(st, u, 'structures');
    if (p.recruits.length >= 4) addStar(st, u, 'recruits');
    if (p.workers.length >= 8) addStar(st, u, 'workers');
    if (p.pop >= POP_MAX) addStar(st, u, 'popularity');
    if (p.power >= POWER_MAX) addStar(st, u, 'power');
  }
}

export const popTier = (pop) => (pop <= 6 ? { star: 3, terr: 2, res: 1 } : pop <= 12 ? { star: 4, terr: 3, res: 2 } : { star: 5, terr: 4, res: 3 });

export function scoreOf(st, uid) {
  const p = st.players[uid];
  const tier = popTier(p.pop);
  const cs = controlled(st, uid);
  const terr = cs.length + (cs.includes('0,0') ? 2 : 0);
  const rt = Object.values(resTotals(st, uid)).reduce((s, v) => s + v, 0);
  const tile = byId(BONUS_TILES, st.bonusTile);
  const bonusN = tile ? p.structures.filter((s) => tile.test(H(s.hex), MAP)).length : 0;
  const parts = {
    coins: p.coins, stars: p.stars.length * tier.star, territories: terr * tier.terr,
    resources: Math.floor(rt / 2) * tier.res, structureBonus: bonusN * (tile?.perStructure || 0),
  };
  return { uid, total: Object.values(parts).reduce((s, v) => s + v, 0), parts, tier, terr, resCount: rt };
}
export function computeScores(st) {
  const rows = Object.keys(st.players).map((uid) => {
    const p = st.players[uid], s = scoreOf(st, uid);
    s.tie = [p.workers.length + p.mechs.length + p.structures.length, p.power, p.pop, s.resCount, s.terr, p.stars.length];
    return s;
  });
  rows.sort((a, b) => b.total - a.total || cmpTie(b.tie, a.tie));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { rows, winner: rows[0].uid };
}
const cmpTie = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

function endTurn(st, uid, ctx) {
  const t = st.turn;
  log(st, uid, '手番終了');
  if (st.over) return;
  const i = st.order.indexOf(uid);
  st.turnUid = st.order[(i + 1) % st.order.length];
  st.turnNo++;
  st.turn = { phase: 'section' };
  void t; void ctx;
}
