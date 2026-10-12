// カード定義。遭遇74・目的27は資料v1.2（official=false は非公式仮案）、工場18は付属画像の絵柄から読み取った暫定解釈。
import { CARDS } from './cards-data.js';
export { BONUS_TILES, byId } from './placeholder.js';

export const ENCOUNTERS = CARDS.enc.map((e) => ({
  id: e.id, no: e.no, official: e.official, name: `遭遇#${e.no}`,
  options: e.options.map((o) => ({ cost: o.cost || {}, gain: o.gain || {}, free: o.free || [], unsupported: !!o.unsupported, text: o.text })),
}));

// 目的カードの達成判定。h は objectiveHelpers() の結果。
const rt4 = (h) => ['wood', 'metal', 'oil', 'food'].map((k) => h.rt[k] || 0);
const CHECKS = {
  1: (p, h) => h.count.mountain >= 3,
  2: (p, h) => h.rt.food >= 6 && h.count.farm >= 1,
  3: (p, h) => h.rt.oil >= 5 && h.count.tundra >= 2,
  4: (p, h) => h.rt.metal >= 5 && p.mechs.length >= 1,
  5: (p, h) => p.coins >= 10 && h.count.village >= 2,
  6: (p, h) => p.workers.length >= 6 && h.count.farm >= 1,
  7: (p) => p.cubes >= 5,
  8: (p, h) => p.structures.length >= 3 && h.count.forest >= 2,
  9: (p) => p.power >= 12 && p.mechs.length >= 1,
  10: (p, h) => rt4(h).filter((v) => v >= 2).length >= 3,
  11: (p, h) => h.count.village >= 3,
  12: (p, h) => h.count.mountain >= 2 && h.rt.metal >= 4,
  13: (p, h) => h.prodTypes >= 3,
  14: (p) => p.recruits.length >= 2,
  15: (p, h) => h.hasFactory && p.mechs.length >= 1,
  16: (p, h) => h.cs.some((x) => h.at(x).char && h.at(x).mech && h.at(x).worker && h.resAt(x) >= 5),
  17: (p) => p.mechs.length >= 3,
  18: (p, h) => p.coins >= 7 && h.resTotal >= 8,
  19: (p) => p.structures.length >= 4,
  20: (p, h) => h.cs.length >= 8,
  21: (p) => p.pop >= 13 && p.recruits.length >= 1,
  22: (p, h) => rt4(h).every((v) => v >= 2),
  23: (p, h) => !h.charAtHome && p.hand >= 3,
  24: (p, h) => h.factoryAdjWorkers >= 5,
  25: (p) => p.pop <= 3 && p.power >= 13 && p.mechs.length >= 2,
  26: (p, h) => h.prodTypes >= 4,
  27: (p, h) => p.structures.length >= 3 && !h.structNearHome,
};
const OFFICIAL_NAMES = { 1: 'Higher Ground Advantage', 11: 'Population Advantage', 16: 'A Wolf Among the Sheep', 24: 'Establish a Human Shield', 25: 'Become a Despised Warmonger', 26: 'Diversify Production', 27: 'Build Local Infrastructure' };
export const OBJECTIVES = CARDS.obj.map((o) => ({
  id: o.id, no: o.no, official: o.official, name: OFFICIAL_NAMES[o.no] || o.name, text: o.text, check: CHECKS[o.no],
}));

// 工場カード（上段アクション）。cost: coins/pop/power/card(戦闘カード)/anyRes(任意資源n個・diff=異なる種類) → gain/free(無料で下段・生産・資源配置)
// 下段は公式どおり「1ユニットを最大2回移動」。効果は絵柄のアイコンからの暫定解釈（verified:false）。
const FC = (cost, gain, free, text) => ({ cost, gain, free, text, verified: false });
const alt = (...k) => [{ alt: k }];
const SPEC = [
  FC({ coins: 1, card: 1 }, {}, [{ k: 'produce' }], '1コイン＋戦闘カード1枚 → 生産（2領土まで）'),
  FC({ pop: 1 }, {}, alt('enlist', 'upgrade'), '人気度1 → 徴兵か改良（無料）'),
  FC({ card: 1 }, { pop: 2 }, [], '戦闘カード1枚 → 人気度+2'),
  FC({ card: 1 }, { coins: 3 }, [], '戦闘カード1枚 → コイン+3'),
  FC({ power: 1 }, { pop: 2 }, [], 'パワー1 → 人気度+2'),
  FC({ power: 1 }, { coins: 3 }, [], 'パワー1 → コイン+3'),
  FC({ pop: 1 }, {}, alt('deploy', 'build'), '人気度1 → 配備か建設（無料）'),
  FC({ card: 1 }, {}, [{ k: 'anyRes', n: 3 }], '戦闘カード1枚 → 好きな資源3個'),
  FC({ coins: 2 }, { pop: 1 }, [{ k: 'upgrade' }], '2コイン → 改良（無料）＋人気度+1'),
  FC({ coins: 2 }, { power: 1 }, [{ k: 'deploy' }], '2コイン → 配備（無料）＋パワー+1'),
  FC({ coins: 2 }, { pop: 1 }, [{ k: 'build' }], '2コイン → 建設（無料）＋人気度+1'),
  FC({ coins: 2 }, { power: 1 }, [{ k: 'enlist' }], '2コイン → 徴兵（無料）＋パワー+1'),
  FC({ anyRes: 2, diff: true }, {}, alt('deploy', 'build'), '異なる資源2個 → 配備か建設（無料）'),
  FC({ card: 1 }, { worker: 1, coins: 2 }, [], '戦闘カード1枚 → ワーカー1体＋2コイン'),
  FC({ anyRes: 1 }, { card: 1, power: 2 }, [], '資源1個 → 戦闘カード1枚＋パワー+2'),
  FC({ anyRes: 1 }, { power: 1, pop: 1, coins: 1 }, [], '資源1個 → パワー・人気度・コイン各+1'),
  FC({ card: 1 }, { power: 1 }, [{ k: 'upgrade' }], '戦闘カード1枚 → 改良（無料）＋パワー+1'),
  FC({ anyRes: 2, diff: true }, {}, alt('enlist', 'upgrade'), '異なる資源2個 → 徴兵か改良（無料）'),
];
export const FACTORY_CARDS = SPEC.map((c, i) => ({ id: `fac_${String(i + 1).padStart(2, '0')}`, no: i + 1, name: `工場カード${i + 1}`, img: `img/factory_${String(i + 1).padStart(2, '0')}.jpg`, ...c }));
