// ★仮データ★ 遭遇カード・目的カード・工場カード・構造物ボーナスタイル。
// 公式のカード面が入手できていないため、動作確認用に作った独自の簡易版です。公式の内容ではありません。
// 公式データを入れるときは同じ形式（ENCOUNTERS / OBJECTIVES / FACTORY_CARDS / BONUS_TILES）で差し替えます。

// ---- 遭遇カード 28枚（3選択肢: cost → gain） ----
// cost/gain のキー: coins, power, pop, card, oil/metal/wood/food（資源）, worker（gainのみ）
const E = (name, a, b, c) => ({ name, verified: false, options: [a, b, c] });
const o = (cost, gain) => ({ cost, gain });
export const ENCOUNTERS = [
  E('旅の商人', o({}, { coins: 2 }), o({ coins: 1 }, { food: 2 }), o({ coins: 2 }, { metal: 2 })),
  E('古い祠', o({}, { pop: 1 }), o({ coins: 1 }, { pop: 2 }), o({ food: 1 }, { power: 2 })),
  E('廃坑', o({}, { metal: 1 }), o({ food: 1 }, { metal: 3 }), o({ coins: 2 }, { oil: 2 })),
  E('脱走兵', o({}, { power: 2 }), o({ coins: 2 }, { card: 1 }), o({ pop: 1 }, { coins: 3 })),
  E('嵐の夜', o({}, { wood: 2 }), o({ food: 1 }, { power: 3 }), o({ power: 1 }, { pop: 2 })),
  E('農夫の頼み', o({}, { food: 2 }), o({ food: 2 }, { pop: 2 }), o({ coins: 1 }, { worker: 1 })),
  E('鍛冶師', o({}, { metal: 1, wood: 1 }), o({ metal: 2 }, { power: 3 }), o({ metal: 1 }, { card: 1 })),
  E('流れ者の兵', o({}, { card: 1 }), o({ coins: 1 }, { card: 2 }), o({ coins: 3 }, { power: 4 })),
  E('油田の噂', o({}, { oil: 1 }), o({ coins: 1 }, { oil: 3 }), o({ oil: 1 }, { coins: 4 })),
  E('村の祭り', o({}, { pop: 1 }), o({ food: 1 }, { pop: 2, coins: 1 }), o({ coins: 2 }, { pop: 3 })),
  E('森の隠者', o({}, { wood: 1 }), o({ wood: 1 }, { power: 2 }), o({ wood: 2 }, { pop: 2 })),
  E('国境の検問', o({}, { coins: 1 }), o({ pop: 1 }, { coins: 4 }), o({ power: 2 }, { coins: 5 })),
  E('難民', o({}, { pop: 1 }), o({ food: 2 }, { worker: 1 }), o({ coins: 2 }, { worker: 1, pop: 1 })),
  E('密輸人', o({}, { coins: 2 }), o({ coins: 2 }, { oil: 1, metal: 1, wood: 1, food: 1 }), o({ pop: 1 }, { coins: 3, power: 1 })),
  E('古戦場', o({}, { power: 1 }), o({ metal: 1 }, { power: 3 }), o({ power: 1 }, { card: 2 })),
  E('見張り台', o({}, { power: 2 }), o({ wood: 1 }, { card: 1, power: 1 }), o({ coins: 1 }, { pop: 1, power: 1 })),
  E('湖の漁師', o({}, { food: 1 }), o({ coins: 1 }, { food: 3 }), o({ food: 1 }, { coins: 2 })),
  E('吟遊詩人', o({}, { pop: 1 }), o({ coins: 1 }, { pop: 2 }), o({ coins: 3 }, { pop: 3, power: 1 })),
  E('崩れた橋', o({}, { wood: 2 }), o({ wood: 1 }, { coins: 3 }), o({ wood: 2 }, { pop: 2 })),
  E('機械の残骸', o({}, { metal: 2 }), o({ metal: 1 }, { oil: 2 }), o({ metal: 2 }, { power: 3, coins: 1 })),
  E('賭博師', o({}, { coins: 1 }), o({ coins: 2 }, { coins: 5 }), o({ pop: 1 }, { coins: 4 })),
  E('徴兵官', o({}, { card: 1 }), o({ food: 1 }, { card: 2 }), o({ food: 2 }, { worker: 1 })),
  E('隊商の護衛', o({}, { coins: 2 }), o({ power: 1 }, { coins: 4 }), o({ power: 2 }, { pop: 2, coins: 2 })),
  E('枯れた井戸', o({}, { oil: 1 }), o({ coins: 1 }, { oil: 2, food: 1 }), o({ oil: 1 }, { power: 2 })),
  E('不思議な旅人', o({}, { pop: 1, coins: 1 }), o({ coins: 1 }, { power: 2, pop: 1 }), o({ pop: 1 }, { card: 2 })),
  E('忘れられた倉庫', o({}, { food: 1, wood: 1 }), o({ coins: 1 }, { metal: 2, oil: 1 }), o({ coins: 2 }, { worker: 1 })),
  E('村長の宴', o({}, { food: 1 }), o({ food: 2 }, { pop: 2, power: 1 }), o({ food: 1 }, { coins: 3 })),
  E('星の下の誓い', o({}, { power: 1, pop: 1 }), o({ power: 1 }, { pop: 2 }), o({ pop: 1 }, { power: 3 })),
].map((e, i) => ({ id: `enc_${String(i + 1).padStart(2, '0')}`, no: i + 1, ...e }));

// ---- 目的カード 23枚 ----
// check(state, uid, h) h = ヘルパー { controlled, workers, structures, resTotal }
const O = (name, text, check) => ({ name, text, verified: false, check });
export const OBJECTIVES = [
  O('広大な領土', '支配する領土が7以上', (p, h) => h.controlled >= 7),
  O('小さな王国', '支配する領土が5以上', (p, h) => h.controlled >= 5),
  O('労働者の国', '盤上のワーカーが6人以上', (p, h) => h.workers >= 6),
  O('入植', '盤上のワーカーが4人以上', (p, h) => h.workers >= 4),
  O('二つの砦', '建物を2つ以上建設', (p, h) => h.structures >= 2),
  O('建築家', '建物を3つ以上建設', (p, h) => h.structures >= 3),
  O('軍備', 'メックを2体以上配備', (p, h) => p.mechs.length >= 2),
  O('機甲部隊', 'メックを3体以上配備', (p, h) => p.mechs.length >= 3),
  O('人気者', '人気度が12以上', (p) => p.pop >= 12),
  O('名声', '人気度が9以上', (p) => p.pop >= 9),
  O('強大な力', 'パワーが12以上', (p) => p.power >= 12),
  O('蓄え', 'パワーが9以上', (p) => p.power >= 9),
  O('豊かな国', 'コインが12以上', (p) => p.coins >= 12),
  O('資源王', '支配領土上の資源が8個以上', (p, h) => h.resTotal >= 8),
  O('倉庫番', '支配領土上の資源が5個以上', (p, h) => h.resTotal >= 5),
  O('改良', '改良を3回以上', (p) => p.cubes >= 3),
  O('技術革新', '改良を4回以上', (p) => p.cubes >= 4),
  O('志願兵', '徴兵を2回以上', (p) => p.recruits.length >= 2),
  O('工場の主', '工場領土を支配している', (p, h) => h.hasFactory),
  O('湖の民', '湖を支配している', (p, h) => h.hasLake),
  O('山の民', '山を3つ以上支配', (p, h) => h.mountains >= 3),
  O('農耕の民', '農場を2つ以上支配', (p, h) => h.farms >= 2),
  O('戦勝', '戦闘に1回以上勝利', (p) => p.combatWins >= 1),
].map((e, i) => ({ id: `obj_${String(i + 1).padStart(2, '0')}`, no: i + 1, ...e }));

// ---- 工場カード 12枚（上段アクション。下段は公式どおり「1ユニットを最大2回移動」） ----
const F = (name, text, cost, gain) => ({ name, text, verified: false, cost, gain });
export const FACTORY_CARDS = [
  F('動力炉', '1コイン→パワー+3', { coins: 1 }, { power: 3 }),
  F('造幣所', 'コイン+3', {}, { coins: 3 }),
  F('資材庫', '好きな資源2個を自領土へ', { coins: 1 }, { anyRes: 2 }),
  F('宣伝局', '1コイン→人気度+2', { coins: 1 }, { pop: 2 }),
  F('訓練所', '1コイン→戦闘カード+2', { coins: 1 }, { card: 2 }),
  F('給食所', '食料+2を自領土へ', {}, { food: 2 }),
  F('製油所', '油+2を自領土へ', {}, { oil: 2 }),
  F('製鉄所', '金属+2を自領土へ', {}, { metal: 2 }),
  F('製材所', '木材+2を自領土へ', {}, { wood: 2 }),
  F('工廠', '2コイン→パワー+2・人気度+1', { coins: 2 }, { power: 2, pop: 1 }),
  F('募兵局', '1コイン→戦闘カード+1・パワー+1', { coins: 1 }, { card: 1, power: 1 }),
  F('円卓', '人気度+1・コイン+1', {}, { pop: 1, coins: 1 }),
].map((e, i) => ({ id: `fac_${String(i + 1).padStart(2, '0')}`, no: i + 1, ...e }));

// ---- 構造物ボーナスタイル（ゲーム終了時） ----
export const BONUS_TILES = [
  { id: 'bonus_lake', name: '湖に隣接する建物', text: '湖に隣接する建物1つにつき2コイン', perStructure: 2,
    test: (hex, map) => hex.nb.some((n) => map.hexes[n].terrain === 'lake') },
  { id: 'bonus_tunnel', name: 'トンネルに隣接/上の建物', text: 'トンネル領土またはその隣の建物1つにつき2コイン', perStructure: 2,
    test: (hex, map) => hex.tunnel || hex.nb.some((n) => map.hexes[n].tunnel) },
  { id: 'bonus_encounter', name: '遭遇のある領土に隣接', text: '遭遇トークンの領土に隣接する建物1つにつき2コイン', perStructure: 2,
    test: (hex, map) => hex.nb.some((n) => map.hexes[n].encounter) },
];

export const byId = (list, id) => list.find((x) => x.id === id);
