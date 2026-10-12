import { LEDGERS, PLAYER_RANGE, buildCombatDeck, factoryCandidateCount } from './data.js';
import { shuffle, cryptoRng } from './draft.js';

/** ゲーム開始を止める要因の一覧。空なら開始可能。未照合データがある限り開始させない。 */
export function startBlockers(playerCount, ledgers = LEDGERS, { allowPlaceholder = false } = {}) {
  const out = [];
  if (playerCount < PLAYER_RANGE.min || playerCount > PLAYER_RANGE.max) {
    out.push(`基本セットは${PLAYER_RANGE.min}〜${PLAYER_RANGE.max}人用です`);
  }
  for (const [k, l] of Object.entries(ledgers)) {
    if (l.verified !== true && !allowPlaceholder) out.push(`カード/盤面データ未確認: ${l.label}（${l.entered}/${l.expected}）`);
  }
  return out;
}

/** 仮データで遊ぶとき、画面に出す注意（開始は止めない） */
export const placeholderNotes = (ledgers = LEDGERS) =>
  Object.values(ledgers).filter((l) => l.verified !== true).map((l) => `仮データ: ${l.label}`);

/** 山札生成と工場カード候補（人数+1枚）。盤面・遭遇・目的は台帳が検証済みになってから追加する。 */
export function buildDecks({ playerCount, factoryIds, rng = cryptoRng }) {
  const factory = shuffle(factoryIds, rng).slice(0, factoryCandidateCount(playerCount));
  return { combat: shuffle(buildCombatDeck(), rng), factoryCandidates: factory };
}
