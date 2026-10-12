// 大鎌戦役 ルールデータ（基本セット）。
// 出所: Scythe_Card_Data_Research_v0.3.docx。verified が true 以外のものは本番で有効化しない。
// 値は資料の転記であり、公式ルールブック／マット画像との最終照合が必要なものは verified:'partial'。

export const BASE_FACTIONS = {
  nordic:  { name: '北方王国', en: 'Nordic',  power: 4, combatCards: 1, ability: 'Swim', verified: 'doc' },
  crimea:  { name: 'クリミア', en: 'Crimea',  power: 3, combatCards: 3, ability: 'Coercion', verified: 'doc' },
  saxony:  { name: 'ザクソン帝国', en: 'Saxony', power: 1, combatCards: 4, ability: 'Dominate', verified: 'doc' },
  polania: { name: 'ポラニア共和国', en: 'Polania', power: 2, combatCards: 2, ability: 'Meander', verified: 'doc' },
  rusviet: { name: 'ラスヴィエト連邦', en: 'Rusviet', power: 3, combatCards: 4, ability: 'Relentless', verified: 'doc' },
};

// 下段アクション: [費用(基本), 減額可能数, コイン報酬]
export const BASE_MATS = {
  industrial:   { name: '工業主義', popularity: 2, coins: 4, objectives: 2,
    columns: ['inspire+monument', 'produce+mill', 'move+mine', 'trade+armory'],
    lower: { upgrade: [3, 1, 3], deploy: [3, 2, 2], build: [3, 1, 1], enlist: [4, 2, 0] }, verified: 'partial' },
  engineering:  { name: '技術者', popularity: 2, coins: 5, objectives: 2,
    columns: ['produce+mill', 'trade+armory', 'inspire+monument', 'move+mine'],
    lower: { upgrade: [3, 1, 2], deploy: [4, 2, 0], build: [3, 2, 3], enlist: [3, 1, 1] }, verified: 'partial' },
  patriotic:    { name: '愛国者', popularity: 2, coins: 6, objectives: 2,
    columns: ['move+mine', 'inspire+monument', 'trade+armory', 'produce+mill'],
    lower: { upgrade: [2, 0, 1], deploy: [4, 3, 3], build: [4, 2, 0], enlist: [3, 1, 2] }, verified: 'partial' },
  mechanical:   { name: '機械論者', popularity: 3, coins: 6, objectives: 2,
    columns: ['trade+armory', 'inspire+monument', 'move+mine', 'produce+mill'],
    lower: { upgrade: [3, 1, 0], deploy: [3, 2, 2], build: [3, 1, 2], enlist: [4, 2, 2] }, verified: 'partial' },
  agricultural: { name: '農業主義', popularity: 4, coins: 7, objectives: 2,
    columns: ['move+mine', 'trade+armory', 'produce+mill', 'inspire+monument'],
    lower: { upgrade: [2, 0, 1], deploy: [4, 2, 0], build: [4, 2, 2], enlist: [3, 2, 3] }, verified: 'partial' },
};

// 公式ルール上の禁止組み合わせ（勢力 → 使えないマット）
export const FORBIDDEN_MATS = {
  rusviet: ['industrial'],
  crimea: ['patriotic'],
};

export function isLegalCombo(factionId, matId) {
  return !(FORBIDDEN_MATS[factionId] || []).includes(matId);
}

// 戦闘カード 42枚
export const COMBAT_DISTRIBUTION = { 2: 16, 3: 12, 4: 8, 5: 6 };

export function buildCombatDeck() {
  const deck = [];
  for (const [v, n] of Object.entries(COMBAT_DISTRIBUTION)) {
    for (let i = 0; i < n; i++) deck.push({ id: `combat_${v}_${String(i + 1).padStart(2, '0')}`, value: Number(v) });
  }
  return deck;
}

// 未入力の台帳。効果は推測で埋めない。入力後に verified:true と出典を設定する。
export const LEDGERS = {
  map:        { label: '盤面（公式盤面画像から読み取り。川の位置は画像からの推定）', expected: 1, entered: 1, verified: false },
  encounters: { label: '遭遇カード#1-74（資料v1.2。非公式仮案を含む／効果未実装の選択肢あり）', expected: 74, entered: 74, verified: false },
  objectives: { label: '目的カード#1-27（資料v1.2。非公式仮案を含む）', expected: 27, entered: 27, verified: false },
  factory:    { label: '工場カード#1-18（付属画像の絵柄からの暫定解釈）', expected: 18, entered: 18, verified: false },
};

export const PLAYER_RANGE = { min: 2, max: 5 }; // 基本セット
export const factoryCandidateCount = (players) => players + 1;

// ---- ゲーム進行用の追加定義 ----
export const MAT_NUMBER = { industrial: 1, engineering: 2, patriotic: 3, mechanical: 4, agricultural: 5 };

// メック能力スロット4つ（ルールブックの並び: Riverwalk → 勢力固有2つ → Speed）。
// 実装済み: speed / riverwalk / camaraderie。それ以外は表示のみ（未実装）。
export const MECH_SLOTS = {
  nordic:  ['riverwalk', 'seaworthy', 'artillery', 'speed'],
  crimea:  ['riverwalk', 'wayfare', 'scout', 'speed'],
  saxony:  ['riverwalk', 'underpass', 'disarm', 'speed'],
  polania: ['riverwalk', 'submerge', 'camaraderie', 'speed'],
  rusviet: ['riverwalk', 'township', 'peoples_army', 'speed'],
};
export const IMPLEMENTED_ABILITIES = ['speed', 'riverwalk', 'camaraderie'];
export const RIVERWALK = {
  nordic: ['forest', 'mountain'], crimea: ['farm', 'tundra'], saxony: ['forest', 'mountain'],
  polania: ['village', 'mountain'], rusviet: ['farm', 'village'],
};
export const ABILITY_NAMES = {
  riverwalk: 'リバーウォーク', speed: 'スピード', camaraderie: '連帯', seaworthy: '航海', artillery: '砲撃',
  wayfare: '道中', scout: '偵察', underpass: '地下道', disarm: '武装解除', submerge: '潜行', township: '町', peoples_army: '人民軍',
};

// 下段アクションの並び（★仮: マット画像との照合まで列0〜3の順に固定）
export const BOTTOM_ORDER = ['upgrade', 'deploy', 'build', 'enlist'];
export const BOTTOM_NAMES = { upgrade: '改良', deploy: '配備', build: '建設', enlist: '徴兵' };
export const BOTTOM_RES = { upgrade: 'oil', deploy: 'metal', build: 'wood', enlist: 'food' };
export const TOP_NAMES = { move: '移動', bolster: '鼓舞', trade: '交易', produce: '生産', factory: '工場' };
export const STRUCT_NAMES = { monument: '記念碑', mill: '製粉所', mine: '鉱山', armory: '兵器庫' };
export const RES_NAMES = { oil: '油', metal: '金属', wood: '木材', food: '食料' };

// 徴兵の一時ボーナス（各2）と、常時ボーナス（★仮: 下段アクション別）
export const RECRUIT_ONETIME = ['power', 'coins', 'pop', 'card'];
export const RECRUIT_ONGOING = { upgrade: { coins: 1 }, deploy: { power: 1 }, build: { pop: 1 }, enlist: { card: 1 } };

export const topOf = (mat, idx) => BASE_MATS[mat].columns[idx].split('+')[0].replace('inspire', 'bolster');
export const structOf = (mat, idx) => BASE_MATS[mat].columns[idx].split('+')[1];
