// 対戦画面（盤面SVG・操作パネル）。状態の判定は engine/game.js、保存は net.js。
import { MAP, DIRS, PX } from './engine/legacy-map.js';
import {
  BASE_FACTIONS, BASE_MATS, MECH_SLOTS, ABILITY_NAMES, IMPLEMENTED_ABILITIES, BOTTOM_ORDER, BOTTOM_NAMES, BOTTOM_RES,
  TOP_NAMES, STRUCT_NAMES, RES_NAMES, RECRUIT_ONETIME, topOf, structOf,
} from './engine/data.js';
import {
  controller, controlled, resTotals, canPay, unitsAt, moveTargets, legalSections, objectiveHelpers, scoreOf, RuleError,
} from './engine/game.js';
import { ENCOUNTERS, OBJECTIVES, FACTORY_CARDS, BONUS_TILES, byId } from './engine/cards.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#d9534f', '#4a90d9', '#e0b43a', '#5cb85c', '#b36bd1'];
const TERR = {
  mountain: ['#8d8d93', '山'], farm: ['#d6c26a', '農'], tundra: ['#9fb9c8', '油'], forest: ['#4f7d41', '森'],
  village: ['#c98f5e', '村'], lake: ['#3f70b3', '湖'], factory: ['#80608f', '工場'], home: ['#5a5148', '本'],
};
const SIZE = 34, SQ3 = Math.sqrt(3), K = 70 / 34; // 盤面画像上ではヘクス半径70px
const corner = (cx, cy, i) => { const a = (Math.PI / 180) * (60 * i - 30); return [cx + SIZE * Math.cos(a), cy + SIZE * Math.sin(a)]; };

export function createGameUI({ root, net, toast, getCtx, onLeave, onRematch }) {
  const ui = {
    selUnit: null, targets: [], carry: false, pick: null, sel: null, zoom: 1, produce: [],
    trade: { r1: 'oil', r2: 'wood', hex: null }, free: { kind: null, hex: null, type: 'monument', mech: 0, slot: 'upgrade', from: 'upgrade', bonus: 'power' }, bot: { slot: 'upgrade', mech: 0, hex: null, type: 'monument', from: 'upgrade', bonus: 'power' },
    fac: { hex: null, r1: 'oil', r2: 'wood' }, combat: { dial: 0, cards: [] }, enc: [], sound: true, lastLog: 0,
  };
  const busy = new Set();
  let audio = null;

  const beep = (f = 440, d = 0.08) => {
    if (!ui.sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = f; g.gain.value = 0.04; o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + d);
    } catch { /* 無視 */ }
  };
  const guard = async (fn) => {
    try { await fn(); }
    catch (e) { if (e instanceof RuleError) toast(e.message); else { toast('通信に失敗しました。もう一度試してください'); console.error(e); } }
  };
  const act = (action) => guard(async () => { await net().dispatch(action); });

  // ---------------------------------------------------------------- 盤面
  function boardSVG(ctx) {
    const { st, me } = ctx;
    const colorOf = (uid) => COLORS[st.order.indexOf(uid)] || '#888';
    const tg = new Set(ui.targets.map((t) => t.to));
    let hexes = '';
    for (const id of MAP.ids) {
      const h = MAP.hexes[id], [X, Y] = h.px || PX(h.q, h.r), hs = st.hexes[id];
      const cx = 0, cy = 0;
      const poly = [0, 1, 2, 3, 4, 5].map((i) => corner(0, 0, i).map((v) => v.toFixed(1)).join(',')).join(' ');
      const homeColor = h.home ? colorOf(Object.keys(st.players).find((u) => st.players[u].faction === h.home) || '') : null;
      const sel = ui.sel === id, isT = tg.has(id), pk = ui.pick && ui.pick.ok?.(id);
      const hi = sel || isT || pk;
      const shape = h.home
        ? `<circle r="${SIZE * 0.95}" fill="#000" fill-opacity=".01" stroke="${hi ? (sel ? '#fff' : isT ? '#ffe36b' : '#7fe0ff') : homeColor}" stroke-width="${hi ? 3.2 : 3}"/>`
        : `<polygon points="${poly}" fill="${hi ? (isT ? '#ffe36b' : pk ? '#7fe0ff' : '#fff') : '#000'}" fill-opacity="${hi ? 0.28 : 0.01}" stroke="${hi ? (sel ? '#fff' : isT ? '#ffe36b' : '#7fe0ff') : 'none'}" stroke-width="3.2"/>`;
      hexes += `<g class="hx" data-hex="${id}" transform="translate(${X.toFixed(1)} ${Y.toFixed(1)}) scale(${K.toFixed(4)})">
        ${shape}
        ${hs.enc ? `<circle cx="${SIZE * 0.62}" cy="${-SIZE * 0.3}" r="7" fill="#e8c14a" stroke="#222"/><text x="${SIZE * 0.62}" y="${-SIZE * 0.3 + 4}" class="eb">!</text>` : ''}
        ${hs.structure ? `<rect x="${-SIZE * 0.78}" y="${-SIZE * 0.45}" width="16" height="16" rx="3" fill="${colorOf(hs.structure.owner)}" stroke="#111"/><text x="${-SIZE * 0.78 + 8}" y="${-SIZE * 0.45 + 12}" class="sb">${STRUCT_NAMES[hs.structure.type][0]}</text>` : ''}
        ${resChips(hs, cx, cy)}
        ${unitMarks(st, id, cx, cy, colorOf, me)}
        </g>`;
    }
    return `<svg viewBox="0 0 1024 1024" style="width:${Math.round(100 * ui.zoom)}%;max-width:none" role="img" aria-label="盤面"><image href="img/map.jpg" width="1024" height="1024"/>${hexes}</svg>`;
  }
  function resChips(hs, cx, cy) {
    const items = Object.entries(hs.res).filter(([, v]) => v > 0);
    const ICON = { oil: '油', metal: '金', wood: '木', food: '食' };
    return items.map(([k, v], i) => `<text x="${cx - SIZE * 0.55 + i * 15}" y="${cy + SIZE * 0.78}" class="rc">${ICON[k]}${v}</text>`).join('');
  }
  function unitMarks(st, id, cx, cy, colorOf, me) {
    const us = unitsAt(st, id); let i = 0, out = '';
    for (const [uid, u] of Object.entries(us)) {
      const c = colorOf(uid), mine = uid === me;
      const mk = (shape, unit, label) => {
        const x = cx - 14 + (i % 3) * 14, y = cy + 2 + Math.floor(i / 3) * 14; i++;
        const on = mine && ui.selUnit === unit;
        const data = mine ? `data-unit="${unit}"` : '';
        if (shape === 'c') return `<circle cx="${x}" cy="${y}" r="7" fill="${c}" stroke="${on ? '#fff' : '#111'}" stroke-width="${on ? 3 : 1.4}" ${data}/><text x="${x}" y="${y + 3.5}" class="ub">${label}</text>`;
        if (shape === 'm') return `<rect x="${x - 6.5}" y="${y - 6.5}" width="13" height="13" fill="${c}" stroke="${on ? '#fff' : '#111'}" stroke-width="${on ? 3 : 1.4}" ${data}/><text x="${x}" y="${y + 3.5}" class="ub">${label}</text>`;
        return `<circle cx="${x}" cy="${y}" r="4.5" fill="${c}" stroke="${on ? '#fff' : '#111'}" stroke-width="${on ? 3 : 1}" ${data}/>`;
      };
      if (u.char) out += mk('c', 'char', '将');
      const p = st.players[uid];
      p.mechs.forEach((m, mi) => { if (m.hex === id) out += mk('m', `m${mi}`, 'M'); });
      p.workers.forEach((w, wi) => { if (w === id) out += mk('w', `w${wi}`, ''); });
    }
    return out;
  }

  // ---------------------------------------------------------------- パネル
  const nm = (ctx, uid) => esc(ctx.names(uid));
  const sectionLabel = (p, s) => {
    if (s === 'factory') return `工場／移動（${esc(byId(FACTORY_CARDS, p.factory)?.name || '')}）`;
    return `${TOP_NAMES[topOf(p.mat, s)]}／${BOTTOM_NAMES[BOTTOM_ORDER[s]]}`;
  };
  const resSel = (key, val) => `<select data-bind="${key}">${['oil', 'metal', 'wood', 'food'].map((r) => `<option value="${r}" ${r === val ? 'selected' : ''}>${RES_NAMES[r]}</option>`).join('')}</select>`;
  const hexBtn = (label, key, cur) => `<button class="ghost sm" data-act="pick" data-v="${key}">${label}: ${cur ? esc(cur) : '選択'}</button>`;

  function panelAction(ctx) {
    const { st, me } = ctx, p = st.players[me], t = st.turn;
    if (st.over) return resultPanel(ctx);
    const mine = st.turnUid === me;
    if (st.pending?.type === 'combat') return combatPanel(ctx);
    if (!mine) return `<div class="card"><h2>${nm(ctx, st.turnUid)} の手番</h2><p class="mute">相手の操作を待っています。</p></div>`;
    if (st.pending?.type === 'encounter') return encounterPanel(ctx);
    if (st.pending?.type === 'free') return freePanel(ctx);
    if (st.pending?.type === 'factory') {
      return `<div class="card"><h2>工場カードを選ぶ（1枚・変更不可）</h2>${st.factoryCandidates.map((id) => {
        const c = byId(FACTORY_CARDS, id); return `<div class="opt facopt"><img src="${c.img}" alt="${esc(c.name)}"><div><b>${esc(c.name)}</b><div class="mute">${esc(c.text)}<br>（絵柄からの暫定解釈）</div><button data-act="factory-pick" data-v="${id}">これにする</button></div></div>`;
      }).join('')}</div>`;
    }
    if (t.phase === 'section') {
      const ok = legalSections(st, me);
      return `<div class="card"><h2>あなたの手番：セクションを選ぶ</h2><p class="mute">前回と別のセクションへアクショントークンを動かします。</p>
        <div class="cols">${[0, 1, 2, 3, ...(p.factory ? ['factory'] : [])].map((s) => `<button class="col" data-act="section" data-v="${s}" ${ok.includes(s) ? '' : 'disabled'}>${s === 'factory' ? sectionLabel(p, s) : `<b>${TOP_NAMES[topOf(p.mat, s)]}</b><i>${BASE_MATS[p.mat].columns[s].split('+')[1] ? STRUCT_NAMES[structOf(p.mat, s)] : ''}</i><u>${BOTTOM_NAMES[BOTTOM_ORDER[s]]}</u>`}</button>`).join('')}</div></div>`;
    }
    const kindTop = p.section === 'factory' ? 'factory' : topOf(p.mat, p.section);
    if (t.phase === 'top') return `<div class="card"><h2>上段：${TOP_NAMES[kindTop]}</h2>${topForm(ctx, kindTop)}
      <div class="row"><button class="ghost" data-act="top-skip">上段を行わない</button></div></div>`;
    if (t.phase === 'moving') return movingPanel(ctx);
    if (t.phase === 'bottom') {
      const kb = p.section === 'factory' ? 'factoryMove' : BOTTOM_ORDER[p.section];
      return `<div class="card"><h2>下段：${kb === 'factoryMove' ? '移動（1ユニット・最大2回）' : BOTTOM_NAMES[kb]}</h2>${bottomForm(ctx, kb)}
        <div class="row"><button class="ghost" data-act="bot-skip">下段を行わない</button></div></div>`;
    }
    return `<div class="card"><h2>手番の終わり</h2>${objectivePanel(ctx)}<div class="row"><button data-act="endTurn">ターンを終了する</button></div></div>`;
  }

  function topForm(ctx, kind) {
    const { st, me } = ctx, p = st.players[me];
    if (kind === 'move') return `<div class="row"><button data-act="move-units">ユニットを移動（最大2体・各1回）</button><button class="ghost" data-act="move-coin">代わりにコイン+1</button></div>`;
    if (kind === 'bolster') return `<p class="mute">1コイン支払い</p><div class="row"><button data-act="bolster-power">パワー+2</button><button data-act="bolster-card">戦闘カード+1</button></div>`;
    if (kind === 'trade') return `<p class="mute">1コイン支払い</p><div class="row"><button data-act="trade-pop">人気度+1</button></div>
      <div class="row">資源 ${resSel('trade.r1', ui.trade.r1)} ${resSel('trade.r2', ui.trade.r2)} ${hexBtn('置く領土', 'trade.hex', ui.trade.hex)} <button data-act="trade-res">資源+2</button></div>`;
    if (kind === 'produce') return `<p class="mute">自分が支配しワーカーがいる領土を最大2か所（盤面をクリック）</p>
      <div class="chips">${producible(ctx).map((id) => `<button class="chip ${ui.produce.includes(id) ? 'on' : ''}" data-act="produce-toggle" data-v="${id}">${TERR[MAP.hexes[id].terrain][1]} ${id}</button>`).join('') || '<span class="mute">生産できる領土がありません</span>'}</div>
      <div class="row">${hexBtn('盤面から選ぶ', 'produce', ui.produce.join(' / '))}<button data-act="produce-go" ${ui.produce.length ? '' : 'disabled'}>生産する</button><button class="ghost sm" data-act="produce-clear">クリア</button></div>`;
    if (kind === 'factory') {
      const c = byId(FACTORY_CARDS, p.factory), n = c.cost.anyRes || 0;
      return `<div class="facopt"><img src="${c.img}" alt=""><div><b>${esc(c.name)}</b><div class="mute">${esc(c.text)}</div>
        ${n ? `<div class="row">支払う資源 ${Array.from({ length: n }, (_, i) => resSel(`fac.pay${i}`, ui.fac['pay' + i] || ['oil', 'wood'][i] || 'oil')).join(' ')}</div>` : ''}
        ${c.gain.worker ? `<div class="row">${hexBtn('ワーカーを置く領土', 'fac.hex', ui.fac.hex)}</div>` : ''}
        <div class="row"><button data-act="factory-go">実行</button></div></div></div>`;
    }
    return '';
  }

  const producible = (ctx) => MAP.ids.filter((id) => okMine(ctx, id) && !['lake', 'home', 'factory'].includes(MAP.hexes[id].terrain));
  const MAT_IMG = { industrial: 1, engineering: 2, patriotic: 3, mechanical: 4, agricultural: 5, militant: 6, innovative: 7 };
  const FAC_IMG = { nordic: 'nordic', crimea: 'crimea', saxony: 'saxony', polania: 'polania', rusviet: 'rusviet', togawa: 'togawa' };
  const matWrap = (ctx, inner) => `<div class="matbg" style="background-image:linear-gradient(rgba(12,10,8,.35),rgba(12,10,8,.7)),url(img/mat_${MAT_IMG[ctx.st.players[ctx.me].mat] || 1}.jpg)">${inner}</div>`;
  function movingPanel(ctx) {
    const { st, me } = ctx, p = st.players[me], mv = st.turn.move;
    const unitName = (u) => (u === 'char' ? 'キャラクター' : u[0] === 'm' ? `メック${+u.slice(1) + 1}` : `ワーカー${+u.slice(1) + 1}`);
    const here = (u) => (u === 'char' ? p.char : u[0] === 'm' ? p.mechs[+u.slice(1)].hex : p.workers[+u.slice(1)]);
    const units = ['char', ...p.mechs.map((_, i) => `m${i}`), ...p.workers.map((_, i) => `w${i}`)];
    const done = mv.kind === 'move' ? mv.moved : [];
    return `<div class="card"><h2>移動中（残り${mv.left}回）</h2>
      <p class="mute">動かすユニットを選び、黄色の領土をクリック。盤面上の自分のユニットをクリックしても選べます。</p>
      <label class="chk"><input type="checkbox" data-bind="carry" ${ui.carry ? 'checked' : ''}> 出発地の資源をすべて運ぶ</label>
      <div class="units">${units.map((u) => `<button class="sm ${ui.selUnit === u ? '' : 'ghost'}" data-act="unit" data-v="${u}" ${done.includes(u) ? 'disabled' : ''}>${unitName(u)} @${here(u)}</button>`).join('')}</div>
      <div class="row"><button data-act="endMove">移動を終える</button></div></div>`;
  }

  function bottomForm(ctx, kind) {
    const { st, me } = ctx, p = st.players[me], m = BASE_MATS[p.mat];
    if (kind === 'factoryMove') return `<div class="row"><button data-act="bot-factory">移動を始める</button></div>`;
    const cost = Math.max(0, m.lower[kind][0] - p.red[kind]);
    const head = `<p>コスト：${RES_NAMES[BOTTOM_RES[kind]]} ${cost}（持っている${RES_NAMES[BOTTOM_RES[kind]]} ${resTotals(st, me)[BOTTOM_RES[kind]]}）／ 報酬：${m.lower[kind][2]}コイン</p>`;
    const b = ui.bot;
    if (kind === 'upgrade') {
      const opts = BOTTOM_ORDER.filter((s) => p.red[s] < m.lower[s][1]);
      return head + `<div class="row">改良先 <select data-bind="bot.slot">${opts.map((s) => `<option value="${s}" ${b.slot === s ? 'selected' : ''}>${BOTTOM_NAMES[s]}のコスト-1</option>`).join('')}</select><button data-act="bot-go">改良する</button></div>`;
    }
    if (kind === 'deploy') {
      const free = [0, 1, 2, 3].filter((i) => !p.mechs.some((x) => x.slot === i));
      return head + `<div class="row">メック <select data-bind="bot.mech">${free.map((i) => { const a = MECH_SLOTS[p.faction][i]; return `<option value="${i}" ${+b.mech === i ? 'selected' : ''}>${ABILITY_NAMES[a]}${IMPLEMENTED_ABILITIES.includes(a) ? '' : '（効果未実装）'}</option>`; }).join('')}</select> ${hexBtn('配置領土', 'bot.hex', b.hex)}<button data-act="bot-go">配備する</button></div>`;
    }
    if (kind === 'build') {
      const free = ['monument', 'mill', 'mine', 'armory'].filter((x) => !p.structures.some((s) => s.type === x));
      return head + `<div class="row">建物 <select data-bind="bot.type">${free.map((x) => `<option value="${x}" ${b.type === x ? 'selected' : ''}>${STRUCT_NAMES[x]}</option>`).join('')}</select> ${hexBtn('建設領土', 'bot.hex', b.hex)}<button data-act="bot-go">建設する</button></div>`;
    }
    const fromFree = BOTTOM_ORDER.filter((s) => !p.recruits.some((r) => r.section === s));
    const bonFree = RECRUIT_ONETIME.filter((x) => !p.recruits.some((r) => r.bonus === x));
    const BN = { power: 'パワー+2', coins: 'コイン+2', pop: '人気度+2', card: '戦闘カード+2' };
    return head + `<div class="row">徴兵トークンの取得元 <select data-bind="bot.from">${fromFree.map((s) => `<option value="${s}" ${b.from === s ? 'selected' : ''}>${BOTTOM_NAMES[s]}</option>`).join('')}</select> 一時ボーナス <select data-bind="bot.bonus">${bonFree.map((x) => `<option value="${x}" ${b.bonus === x ? 'selected' : ''}>${BN[x]}</option>`).join('')}</select><button data-act="bot-go">徴兵する</button></div>`;
  }

  function encounterPanel(ctx) {
    const { st, me } = ctx, p = st.players[me], pd = st.pending;
    if (!pd.cardId) return `<div class="card"><h2>遭遇</h2><p class="mute">遭遇カードを引いています…</p></div>`;
    const c = byId(ENCOUNTERS, pd.cardId), max = p.faction === 'polania' ? 2 : 1;
    const okOpt = (o) => !o.unsupported && canPay(st, me, o.cost);
    const none = !c.options.some(okOpt);
    return `<div class="card"><h2>遭遇 #${c.no} ${c.official ? '' : '<span class="tag">仮案</span>'}</h2><p class="mute">選択肢を${max === 2 ? '最大2つ（ポラニア）' : '1つ'}選びます。</p>
      ${c.options.map((o, i) => `<label class="opt ${okOpt(o) ? '' : 'dim'}"><input type="${max === 2 ? 'checkbox' : 'radio'}" name="enc" data-bind="enc" value="${i}" ${okOpt(o) ? '' : 'disabled'} ${ui.enc.includes(i) ? 'checked' : ''}> ${esc(o.text)}${o.unsupported ? ' <span class="tag">未実装</span>' : ''}</label>`).join('')}
      <div class="row"><button data-act="enc-go" ${none || ui.enc.length ? '' : 'disabled'}>${none ? '見送る（選べる選択肢なし）' : 'この選択で解決'}</button></div></div>`;
  }
  const FREE_NAMES = { build: '建設', upgrade: '改良', deploy: '配備', enlist: '徴兵', produce: '生産', anyRes: '好きな資源' };
  function freePanel(ctx) {
    const { st, me } = ctx, p = st.players[me], pd = st.pending, head = pd.queue[0];
    const kinds = head.alt || [head.k];
    const f = ui.free, k = kinds.includes(f.kind) ? f.kind : kinds[0];
    let body = '';
    if (k === 'build') {
      const fr = ['monument', 'mill', 'mine', 'armory'].filter((x) => !p.structures.some((s) => s.type === x));
      body = `建物 <select data-bind="free.type">${fr.map((x) => `<option value="${x}" ${f.type === x ? 'selected' : ''}>${STRUCT_NAMES[x]}</option>`).join('')}</select> ${hexBtn('建設領土', 'free.hex', f.hex)}`;
    } else if (k === 'deploy') {
      const free = [0, 1, 2, 3].filter((i) => !p.mechs.some((x) => x.slot === i));
      body = `メック <select data-bind="free.mech">${free.map((i) => `<option value="${i}" ${+f.mech === i ? 'selected' : ''}>${ABILITY_NAMES[MECH_SLOTS[p.faction][i]]}</option>`).join('')}</select> ${hexBtn('配置領土', 'free.hex', f.hex)}`;
    } else if (k === 'upgrade') {
      const opts = BOTTOM_ORDER.filter((s) => p.red[s] < BASE_MATS[p.mat].lower[s][1]);
      body = `改良先 <select data-bind="free.slot">${opts.map((s) => `<option value="${s}" ${f.slot === s ? 'selected' : ''}>${BOTTOM_NAMES[s]}のコスト-1</option>`).join('')}</select>`;
    } else if (k === 'enlist') {
      const fromFree = BOTTOM_ORDER.filter((s) => !p.recruits.some((r) => r.section === s));
      const bonFree = RECRUIT_ONETIME.filter((x) => !p.recruits.some((r) => r.bonus === x));
      const BN = { power: 'パワー+2', coins: 'コイン+2', pop: '人気度+2', card: '戦闘カード+2' };
      body = `取得元 <select data-bind="free.from">${fromFree.map((s) => `<option value="${s}" ${f.from === s ? 'selected' : ''}>${BOTTOM_NAMES[s]}</option>`).join('')}</select> 一時ボーナス <select data-bind="free.bonus">${bonFree.map((x) => `<option value="${x}" ${f.bonus === x ? 'selected' : ''}>${BN[x]}</option>`).join('')}</select>`;
    } else if (k === 'produce') {
      body = `<div class="chips">${producible(ctx).map((id) => `<button class="chip ${ui.produce.includes(id) ? 'on' : ''}" data-act="produce-toggle" data-v="${id}">${TERR[MAP.hexes[id].terrain][1]} ${id}</button>`).join('')}</div>`;
    } else if (k === 'anyRes') {
      body = `${Array.from({ length: head.n }, (_, i) => resSel(`free.r${i}`, f['r' + i] || 'oil')).join(' ')} ${hexBtn('置く領土', 'free.hex', f.hex)}`;
    }
    const sel = kinds.length > 1 ? `<div class="row">${kinds.map((x) => `<button class="sm ${x === k ? '' : 'ghost'}" data-act="free-kind" data-v="${x}">${FREE_NAMES[x]}</button>`).join('')}</div>` : '';
    return `<div class="card"><h2>無料効果：${kinds.map((x) => FREE_NAMES[x]).join('か')}（残り${pd.queue.length}）</h2><p class="mute">費用なしで実行します。</p>${sel}
      <div class="row">${body}<button data-act="free-go" data-v="${k}">実行</button><button class="ghost" data-act="free-skip">行わない</button></div></div>`;
  }
  const LABEL = { coins: 'コイン', power: 'パワー', pop: '人気度', card: '戦闘カード', oil: '油', metal: '金属', wood: '木材', food: '食料', worker: 'ワーカー' };

  function combatPanel(ctx) {
    const { st, me, priv, combat } = ctx, pd = st.pending;
    const inFight = me === pd.attacker || me === pd.defender;
    const head = `<h2>戦闘：${nm(ctx, pd.attacker)}（攻撃）対 ${nm(ctx, pd.defender)}</h2>`;
    if (!inFight) return `<div class="card">${head}<p class="mute">戦闘の結果を待っています。</p></div>`;
    const p = st.players[me], units = me === pd.attacker ? pd.attUnits : pd.defUnits;
    const committed = !!combat?.commits?.[me];
    if (committed) return `<div class="card">${head}<p>戦力を確定しました。${combat?.commits && Object.keys(combat.commits).length >= 2 ? '公開しています…' : '相手の確定を待っています…'}</p></div>`;
    const hand = (priv?.hand || []).slice().sort((a, b) => a.value - b.value);
    const maxDial = Math.min(7, p.power);
    return `<div class="card">${head}<p class="mute">ダイヤルと戦闘カードを秘密に決め、同時に公開します。同点は攻撃側の勝ち。</p>
      <div class="row">ダイヤル（パワー${p.power}・最大${maxDial}） <select data-bind="combat.dial">${Array.from({ length: maxDial + 1 }, (_, i) => `<option value="${i}" ${+ui.combat.dial === i ? 'selected' : ''}>${i}</option>`).join('')}</select></div>
      <p>戦闘カード（関与ユニット${units}体まで／手札${hand.length}枚）</p>
      <div class="row">${hand.map((c) => `<label class="cardchip"><input type="checkbox" data-bind="combat.card" value="${c.id}" ${ui.combat.cards.includes(c.id) ? 'checked' : ''}> ${c.value}</label>`).join('') || '<span class="mute">手札なし</span>'}</div>
      <div class="row"><button data-act="combat-commit">確定する</button></div></div>`;
  }

  function objectivePanel(ctx) {
    const { st, me, priv } = ctx, p = st.players[me];
    const list = (priv?.objectives || []).map((id) => byId(OBJECTIVES, id)).filter(Boolean);
    if (!list.length) return '';
    const h = objectiveHelpers(st, me);
    return `<p class="mute">目的カード（達成していれば宣言して星を得ます）</p>${list.map((o) => {
      const ok = o.check(p, h) && !(p.stars.includes('objective') && (p.faction !== 'saxony' || p.stars.includes('objective2')));
      return `<div class="opt"><b>${esc(o.name)}</b>${o.official ? "" : '<span class="tag">仮案</span>'} <span class="mute">${esc(o.text)}</span> <button class="sm" data-act="objective" data-v="${o.id}" ${ok ? '' : 'disabled'}>宣言</button></div>`;
    }).join('')}`;
  }

  function resultPanel(ctx) {
    const { st, room, me } = ctx, r = st.result;
    return `<div class="card"><h2>ゲーム終了</h2><p>勝者：<b>${nm(ctx, r.winner)}</b></p>
      <table class="tbl"><tr><th>順位</th><th>名前</th><th>合計</th><th>コイン</th><th>星</th><th>領土</th><th>資源</th><th>建物ボーナス</th></tr>
      ${r.rows.map((x) => `<tr><td>${x.rank}</td><td>${nm(ctx, x.uid)}</td><td><b>${x.total}</b></td><td>${x.parts.coins}</td><td>${x.parts.stars}</td><td>${x.parts.territories}</td><td>${x.parts.resources}</td><td>${x.parts.structureBonus}</td></tr>`).join('')}</table>
      <div class="row">${room.hostUid === me ? '<button data-act="rematch">同じメンバーでもう一度</button>' : ''}<button class="ghost" data-act="leave">退出</button></div></div>`;
  }

  function playersPanel(ctx) {
    const { st } = ctx;
    return `<div class="card"><h2>プレイヤー</h2>${st.order.map((uid, i) => {
      const p = st.players[uid], rt = resTotals(st, uid), tr = st.turnUid === uid;
      const sc = scoreOf(st, uid);
      return `<div class="pl ${tr ? 'turn' : ''}"><span class="dot" style="background:${COLORS[i]}"></span><b>${nm(ctx, uid)}</b>
        <span class="mute">${BASE_FACTIONS[p.faction].name}／${BASE_MATS[p.mat].name}</span>
        <div class="stats">コイン${p.coins} パワー${p.power} 人気度${p.pop} 手札${p.hand}枚 星${p.stars.length}/6</div>
        <div class="stats mute">油${rt.oil} 金${rt.metal} 木${rt.wood} 食${rt.food} ／ 暫定${sc.total}点 ／ ワーカー${p.workers.length} メック${p.mechs.length} 建物${p.structures.length}</div></div>`;
    }).join('')}</div>`;
  }

  function minePanel(ctx) {
    const { st, me, priv } = ctx, p = st.players[me];
    const hand = (priv?.hand || []).slice().sort((a, b) => a.value - b.value).map((c) => c.value);
    const abil = MECH_SLOTS[p.faction].map((a, i) => `${ABILITY_NAMES[a]}${p.mechs.some((m) => m.slot === i) ? '✔' : ''}${IMPLEMENTED_ABILITIES.includes(a) ? '' : '(未実装)'}`).join(' / ');
    return `<div class="card facbg" style="background-image:linear-gradient(rgba(12,10,8,.55),rgba(12,10,8,.82)),url(img/faction_${p.faction}.jpg)"><h2>あなたの国マット：${BASE_FACTIONS[p.faction].name}</h2>
      <div class="stats">戦闘カード: ${hand.join(', ') || 'なし'}</div>
      <div class="stats">改良 ${p.cubes}/6（コスト減: 改良${p.red.upgrade} 配備${p.red.deploy} 建設${p.red.build} 徴兵${p.red.enlist}）／ 徴兵 ${p.recruits.length}/4 ／ マット上ワーカー ${p.matWorkers}</div>
      <div class="stats">メック能力: ${abil}</div>
      <div class="stats">星: ${p.stars.join(', ') || 'なし'}</div>
      ${p.factory ? `<div class="stats">工場カード: ${esc(byId(FACTORY_CARDS, p.factory).name)}</div>` : ''}</div>`;
  }

  function hexPanel(ctx) {
    const { st } = ctx;
    if (!ui.sel) return `<div class="card"><h2>領土</h2><p class="mute">盤面の領土をクリックすると詳細を表示します。</p></div>`;
    const h = MAP.hexes[ui.sel], hs = st.hexes[ui.sel], us = unitsAt(st, ui.sel), c = controller(st, ui.sel);
    return `<div class="card"><h2>領土 ${ui.sel}：${TERR[h.terrain][1]}</h2>
      <div class="stats">支配: ${c ? nm(ctx, c) : 'なし'} ${hs.enc ? '／ 遭遇トークンあり' : ''} ${h.tunnel ? '／ トンネル' : ''}</div>
      <div class="stats">資源: ${Object.entries(hs.res).filter(([, v]) => v).map(([k, v]) => `${RES_NAMES[k]}${v}`).join(' ') || 'なし'} ${hs.structure ? `／ 建物: ${STRUCT_NAMES[hs.structure.type]}（${nm(ctx, hs.structure.owner)}）` : ''}</div>
      <div class="stats">ユニット: ${Object.entries(us).map(([u, x]) => `${nm(ctx, u)}(将${x.char ? 1 : 0} M${x.mechs} 工${x.workers})`).join(' ') || 'なし'}</div></div>`;
  }

  function logPanel(ctx) {
    const { st } = ctx;
    return `<div class="card"><h2>ログ</h2><div class="log">${st.log.slice(-40).reverse().map((l) => `<div><span class="mute">T${l.n}</span> ${nm(ctx, l.uid)}：${esc(l.text)}</div>`).join('')}</div></div>`;
  }

  // ---------------------------------------------------------------- 描画
  function render() {
    const ctx = getCtx();
    if (!ctx?.st) { root.innerHTML = '<p>読み込み中…</p>'; return; }
    const { st, me } = ctx;
    const tile = byId(BONUS_TILES, st.bonusTile);
    const mine = st.turnUid === me && !st.over;
    root.innerHTML = `
      <div class="banner">★暫定版★ 盤面は公式画像から読み取り（川は推定）。遭遇・目的の一部は非公式仮案、工場カードは絵柄からの暫定解釈、構造物ボーナスは仮（${esc(tile?.name || '')}）。メックの一部能力は未実装。</div>
      <div class="turnbar ${mine ? 'mine' : ''}">${st.over ? 'ゲーム終了' : `手番：<b>${nm(ctx, st.turnUid)}</b>${mine ? '（あなた）' : ''}`} <span class="mute">ターン${st.turnNo}</span>
        <span class="tools"><button class="ghost sm" data-act="zoom-">−</button><button class="ghost sm" data-act="zoom+">＋</button>
        <label class="chk"><input type="checkbox" data-bind="sound" ${ui.sound ? 'checked' : ''}> 効果音</label></span></div>
      <div class="game">
        <div class="boardwrap" id="boardwrap">${boardSVG(ctx)}</div>
        <div class="side">${st.over ? panelAction(ctx) : matWrap(ctx, panelAction(ctx))}${playersPanel(ctx)}${minePanel(ctx)}${hexPanel(ctx)}${logPanel(ctx)}</div>
      </div>`;
    if (st.log.length !== ui.lastLog) {
      if (ui.lastLog) { const last = st.log[st.log.length - 1]; beep(/星/.test(last.text) ? 880 : /戦闘/.test(last.text) ? 220 : 440); }
      ui.lastLog = st.log.length;
    }
  }

  // ---------------------------------------------------------------- 自動処理（スナップショットごとに呼ぶ）
  async function tick() {
    const ctx = getCtx();
    if (!ctx?.st) return;
    const { st, me, deck, combat } = ctx;
    if (deck && ((deck.grants?.[me] || 0) > 0 || (deck.objGrants?.[me] || 0) > 0) && !busy.has('claim')) {
      busy.add('claim'); await guard(() => net().claim()); busy.delete('claim');
    }
    const pd = st.pending;
    if (pd?.type === 'encounter' && !pd.cardId && st.turnUid === me && !busy.has('enc')) {
      busy.add('enc'); await guard(() => net().drawEncounter()); busy.delete('enc');
    }
    if (pd?.type === 'combat' && (me === pd.attacker || me === pd.defender)) {
      const both = combat?.commits && Object.keys(combat.commits).length >= 2;
      if (both && !combat.reveals?.[me] && !busy.has(`rv${pd.key}`)) {
        busy.add(`rv${pd.key}`); await guard(() => net().revealCombat(pd.key));
      }
      if (me === pd.attacker && combat?.reveals && Object.keys(combat.reveals).length >= 2 && !busy.has(`rs${pd.key}`)) {
        busy.add(`rs${pd.key}`);
        const a = await net().verifyReveal(pd.key, pd.attacker, combat), d = await net().verifyReveal(pd.key, pd.defender, combat);
        if (!a || !d) { toast('戦力の公開内容が確定時と一致しません'); busy.delete(`rs${pd.key}`); return; }
        await guard(() => net().dispatch({ t: 'combat', att: a, def: d }));
      }
    }
  }

  // ---------------------------------------------------------------- 入力
  const setPath = (path, val) => { const [a, b] = path.split('.'); if (b) ui[a][b] = val; else ui[a] = val; };

  function selectUnit(ctx, unit) {
    const { st, me } = ctx, mv = st.turn.move;
    if (!mv) return;
    if (mv.kind === 'move' && mv.moved.includes(unit)) return toast('そのユニットはすでに動かしました');
    ui.selUnit = unit;
    const allow = mv.kind === 'factoryMove' ? (mv.idx === 0 && unit[0] !== 'w' && st.players[me].mechs.some((m) => MECH_SLOTS[st.players[me].faction][m.slot] === 'speed') ? 2 : 1) : undefined;
    ui.targets = moveTargets(st, me, unit, allow);
    render();
  }

  function onHex(ctx, id) {
    const { st, me } = ctx;
    if (ui.pick) {
      const { key } = ui.pick;
      if (!ui.pick.ok(id)) { toast('そこは選べません'); return; }
      if (key === 'produce') { if (!ui.produce.includes(id)) ui.produce = [...ui.produce, id].slice(-2); else ui.produce = ui.produce.filter((x) => x !== id); }
      else if (key === 'trade.hex') ui.trade.hex = id;
      else if (key === 'fac.hex') ui.fac.hex = id;
      else if (key === 'bot.hex') ui.bot.hex = id;
      else if (key === 'free.hex') ui.free.hex = id;
      if (key !== 'produce') ui.pick = null;
      render(); return;
    }
    if (st.turn.phase === 'moving' && ui.selUnit && ui.targets.some((t) => t.to === id)) {
      const unit = ui.selUnit;
      let carry;
      if (ui.carry) { const from = st.turn.move && (unit === 'char' ? st.players[me].char : unit[0] === 'm' ? st.players[me].mechs[+unit.slice(1)].hex : st.players[me].workers[+unit.slice(1)]); carry = { ...st.hexes[from].res }; }
      ui.selUnit = null; ui.targets = [];
      act({ t: 'move', unit, to: id, carry });
      beep(520); return;
    }
    ui.sel = id; render();
  }

  const okMine = (ctx, id) => controller(ctx.st, id) === ctx.me && ctx.st.players[ctx.me].workers.includes(id);

  function onClick(e) {
    const ctx = getCtx(); if (!ctx?.st) return;
    const { st, me } = ctx;
    const unitEl = e.target.closest('[data-unit]');
    if (unitEl && st.turn.phase === 'moving' && st.turnUid === me && !st.pending) { selectUnit(ctx, unitEl.dataset.unit); return; }
    const btn = e.target.closest('[data-act]');
    if (btn) { handleAct(ctx, btn.dataset.act, btn.dataset.v); return; }
    const hx = e.target.closest('[data-hex]');
    if (hx) onHex(ctx, hx.dataset.hex);
  }

  function handleAct(ctx, a, v) {
    const { st, me } = ctx, p = st.players[me];
    switch (a) {
      case 'zoom+': ui.zoom = Math.min(2.4, ui.zoom + 0.2); render(); break;
      case 'zoom-': ui.zoom = Math.max(0.6, ui.zoom - 0.2); render(); break;
      case 'leave': onLeave(); break;
      case 'rematch': onRematch(); break;
      case 'section': act({ t: 'section', section: v === 'factory' ? 'factory' : +v }); break;
      case 'top-skip': act({ t: 'top', kind: 'skip' }); break;
      case 'move-units': act({ t: 'top', kind: 'move', mode: 'units' }); break;
      case 'move-coin': act({ t: 'top', kind: 'move', mode: 'coin' }); break;
      case 'bolster-power': act({ t: 'top', kind: 'bolster', mode: 'power' }); break;
      case 'bolster-card': act({ t: 'top', kind: 'bolster', mode: 'card' }); break;
      case 'trade-pop': act({ t: 'top', kind: 'trade', mode: 'pop' }); break;
      case 'trade-res':
        if (!ui.trade.hex) return toast('資源を置く領土を選んでください');
        act({ t: 'top', kind: 'trade', mode: 'res', res: [{ type: ui.trade.r1, hex: ui.trade.hex }, { type: ui.trade.r2, hex: ui.trade.hex }] }); break;
      case 'produce-go': act({ t: 'top', kind: 'produce', hexes: ui.produce }); ui.produce = []; ui.pick = null; break;
      case 'produce-toggle': ui.produce = ui.produce.includes(v) ? ui.produce.filter((x) => x !== v) : [...ui.produce, v].slice(-2); render(); break;
      case 'free-kind': ui.free.kind = v; render(); break;
      case 'free-skip': ui.produce = []; act({ t: 'free', skip: true }); break;
      case 'free-go': {
        const f = ui.free, body = { t: 'free', kind: v };
        if (v === 'build') Object.assign(body, { type: f.type, hex: f.hex });
        else if (v === 'deploy') Object.assign(body, { slot: +f.mech, hex: f.hex });
        else if (v === 'upgrade') body.slot = f.slot;
        else if (v === 'enlist') Object.assign(body, { from: f.from, bonus: f.bonus });
        else if (v === 'produce') { body.hexes = ui.produce; ui.produce = []; }
        else if (v === 'anyRes') { const n = st.pending.queue[0].n; body.res = Array.from({ length: n }, (_, i) => f['r' + i] || 'oil'); body.hex = f.hex || p.char; }
        act(body); ui.free.hex = null; break;
      }
      case 'produce-clear': ui.produce = []; ui.pick = null; render(); break;
      case 'factory-go': { const c = byId(FACTORY_CARDS, p.factory); act({ t: 'top', kind: 'factory', hex: ui.fac.hex || p.char, payRes: Array.from({ length: c.cost.anyRes || 0 }, (_, i) => ui.fac['pay' + i] || ['oil', 'wood'][i] || 'oil') }); }; break;
      case 'unit': selectUnit(ctx, v); break;
      case 'endMove': ui.selUnit = null; ui.targets = []; act({ t: 'endMove' }); break;
      case 'bot-skip': act({ t: 'bottom', kind: 'skip' }); break;
      case 'bot-factory': act({ t: 'bottom', kind: 'factoryMove' }); break;
      case 'bot-go': {
        const kind = BOTTOM_ORDER[p.section], b = ui.bot;
        const body = kind === 'upgrade' ? { slot: b.slot } : kind === 'deploy' ? { slot: +b.mech, hex: b.hex } : kind === 'build' ? { type: b.type, hex: b.hex } : { from: b.from, bonus: b.bonus };
        act({ t: 'bottom', kind, ...body }); break;
      }
      case 'objective': act({ t: 'objective', cardId: v }); break;
      case 'endTurn': if (confirm('ターンを終了しますか？')) act({ t: 'endTurn' }); break;
      case 'enc-go': act({ t: 'encounter', picks: ui.enc }); ui.enc = []; break;
      case 'factory-pick': act({ t: 'factory', cardId: v }); break;
      case 'combat-commit': {
        const pd = st.pending, maxDial = Math.min(7, p.power), units = me === pd.attacker ? pd.attUnits : pd.defUnits;
        const dial = Math.max(0, Math.min(maxDial, Math.floor(+ui.combat.dial || 0)));
        if (ui.combat.cards.length > units) return toast(`戦闘カードは${units}枚までです`);
        guard(() => net().commitCombat(pd.key, dial, ui.combat.cards)).then(() => { ui.combat = { dial: 0, cards: [] }; });
        break;
      }
      case 'pick': {
        const key = v;
        const ok = key === 'produce' ? (id) => okMine(ctx, id) && !['lake', 'home', 'factory'].includes(MAP.hexes[id].terrain)
          : (id) => okMine(ctx, id);
        ui.pick = { key, ok }; toast('盤面の領土をクリックしてください'); render(); break;
      }
      default:
    }
  }

  function onChange(e) {
    const el = e.target.closest('[data-bind]'); if (!el) return;
    const k = el.dataset.bind;
    if (k === 'carry') ui.carry = el.checked;
    else if (k === 'sound') ui.sound = el.checked;
    else if (k === 'enc') {
      const max = (getCtx().st.players[getCtx().me].faction === 'polania') ? 2 : 1;
      const i = +el.value;
      ui.enc = el.type === 'radio' ? [i] : el.checked ? [...ui.enc, i].slice(-max) : ui.enc.filter((x) => x !== i);
      render(); return;
    } else if (k === 'combat.card') {
      ui.combat.cards = el.checked ? [...ui.combat.cards, el.value] : ui.combat.cards.filter((x) => x !== el.value);
    } else setPath(k, el.value);
  }

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);

  return { render, tick };
}
