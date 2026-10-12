// カスタムドラフト（アプリ独自ルール）。仕様書4章。
// 1) 第1→第2→第3希望の順に処理 2) 同順位の競合者間だけで抽選 3) 未割当は残りの合法候補から等確率
// 追加: 希望を通すことで残りのプレイヤーが合法な割当を持てなくなる場合は、その希望を通さない。

export const cryptoRng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

export function shuffle(arr, rng = cryptoRng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 全員に合法な割当が存在するか
export function canMatch(players, avail, legal) {
  if (players.length === 0) return true;
  const [p, ...rest] = players;
  return avail.some((c) => legal(p, c) && canMatch(rest, avail.filter((x) => x !== c), legal));
}

export function validatePrefs(prefs, candidates, uid, legal) {
  if (!Array.isArray(prefs) || prefs.length > 3) return '希望は最大3つです';
  if (new Set(prefs).size !== prefs.length) return '同じ候補を重複して指定できません';
  for (const c of prefs) {
    if (!candidates.includes(c)) return '存在しない候補です';
    if (!legal(uid, c)) return '公式ルールで禁止された組み合わせです';
  }
  return null;
}

/**
 * @param players   uid[]
 * @param prefs     { uid: [候補, ...] }
 * @param candidates 候補ID[]
 * @param legal     (uid, 候補) => boolean
 * @returns { assignments: {uid: 候補}, log: [...] }
 */
export function resolveDraft({ players, prefs, candidates, legal, rng = cryptoRng }) {
  if (!canMatch(players, candidates, legal)) throw new Error('合法な割当が存在しません');
  const assigned = {};
  const log = [];
  const taken = new Set();
  const remainingPlayers = () => players.filter((p) => !(p in assigned));

  for (let rank = 0; rank < 3; rank++) {
    const groups = new Map();
    for (const p of remainingPlayers()) {
      const c = (prefs[p] || [])[rank];
      if (c === undefined || taken.has(c) || !legal(p, c)) continue;
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(p);
    }
    // 結果が順序に依存しないよう候補の処理順はランダム
    for (const c of shuffle([...groups.keys()], rng)) {
      let contenders = groups.get(c).filter((p) => !(p in assigned));
      while (contenders.length) {
        const winner = pick(contenders, rng);
        const rest = players.filter((p) => p !== winner && !(p in assigned));
        const avail = candidates.filter((x) => !taken.has(x) && x !== c);
        if (canMatch(rest, avail, legal)) {
          assigned[winner] = c; taken.add(c);
          log.push({ type: 'pref', rank: rank + 1, candidate: c, winner, contenders: [...contenders] });
          break;
        }
        log.push({ type: 'pref_blocked', rank: rank + 1, candidate: c, player: winner });
        contenders = contenders.filter((p) => p !== winner);
      }
    }
  }

  for (const p of shuffle(remainingPlayers(), rng)) {
    const rest = players.filter((x) => x !== p && !(x in assigned));
    const options = candidates.filter(
      (c) => !taken.has(c) && legal(p, c) && canMatch(rest, candidates.filter((x) => !taken.has(x) && x !== c), legal),
    );
    const c = pick(options, rng);
    assigned[p] = c; taken.add(c);
    log.push({ type: 'random', candidate: c, player: p });
  }
  return { assignments: assigned, log };
}
