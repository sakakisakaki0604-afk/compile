// 戦闘の純粋ロジック。資料 v0.3 第3章・3.1に基づく。要ルールブック照合の点は NOTE を参照。

export const DIAL_MAX = 7;

/** 戦闘の選択を検証。units=関与する戦闘ユニット数、trackPower=現在のパワー、hand=戦闘カード[{id,value}] */
export function validateChoice({ dial, cardIds, units, trackPower, hand }) {
  if (!Number.isInteger(dial) || dial < 0) return 'ダイヤルは0以上の整数です';
  if (dial > Math.min(DIAL_MAX, trackPower)) return `ダイヤルは${Math.min(DIAL_MAX, trackPower)}以下です`;
  if (new Set(cardIds).size !== cardIds.length) return '同じカードを重複して出せません';
  if (cardIds.length > units) return `戦闘カードは関与ユニット数(${units})枚までです`;
  const ids = new Set(hand.map((c) => c.id));
  if (!cardIds.every((id) => ids.has(id))) return '手札にないカードです';
  return null;
}

export const cardTotal = (cardIds, hand) =>
  cardIds.reduce((s, id) => s + hand.find((c) => c.id === id).value, 0);

/** 同点は攻撃側の勝ち。 */
export function resolveCombat(att, def) {
  const a = att.dial + att.cardsValue;
  const d = def.dial + def.cardsValue;
  const winner = a >= d ? 'attacker' : 'defender';
  const loser = winner === 'attacker' ? 'defender' : 'attacker';
  const revealed = { attacker: a > 0, defender: d > 0 };
  return {
    attackerTotal: a, defenderTotal: d, winner, loser,
    // NOTE: 資料では「負けた側が1以上の戦力を公開していた場合、カードを1枚引く」。ルールブックで要照合。
    loserDrawsCard: revealed[loser],
  };
}

/**
 * 秘密選択のコミット（ダイヤル値＋ナンスのハッシュ）。公開前に相手へ値を見せないために使う。
 * 公開時に値とナンスを出し、相手側で同じハッシュになるか検査する。
 */
export async function commitChoice(choice, nonce) {
  const data = new TextEncoder().encode(JSON.stringify({ choice, nonce }));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
