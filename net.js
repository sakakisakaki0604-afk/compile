// Firestore との通信。ルール判定は engine/game.js（全クライアント共通）で行い、ここは読み書きだけを担当する。
import { doc, getDoc, setDoc, runTransaction } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { apply } from './engine/game.js';
import { commitChoice } from './engine/combat.js';
import { ENCOUNTERS, OBJECTIVES } from './engine/cards.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
const rid32 = () => [...crypto.getRandomValues(new Uint8Array(6))].map((x) => x.toString(16).padStart(2, '0')).join('');

export function makeNet(db, roomId, uid) {
  const roomRef = doc(db, 'rooms', roomId);
  const deckRef = doc(db, 'rooms', roomId, 'pub', 'deck');
  const privRef = doc(db, 'rooms', roomId, 'private', uid);
  const combatRef = (key) => doc(db, 'rooms', roomId, 'pub', `combat_${key}`);

  const gamePatch = (room, st) => ({ game: { turnUid: st.turnUid, json: JSON.stringify(st), over: st.over }, revision: room.revision + 1 });

  /** 操作を適用して保存。違反は RuleError が投げられ、何も書かれない。 */
  async function dispatch(action) {
    return runTransaction(db, async (tx) => {
      const rs = await tx.get(roomRef); const ds = await tx.get(deckRef); const ps = await tx.get(privRef);
      const room = rs.data(); const deck = ds.data();
      const res = apply(JSON.parse(room.game.json), uid, action);
      tx.update(roomRef, gamePatch(room, res.state));
      const upd = {};
      if (res.cardPays) { // 戦闘カードを費用に使った: 価値の低い順に捨てる
        const hand = [...(ps.data()?.hand || [])].sort((x, y) => x.value - y.value);
        const gone = hand.splice(0, res.cardPays);
        for (const c of gone) res.discards[c.value] = (res.discards[c.value] || 0) + 1;
        tx.set(privRef, { hand }, { merge: true });
      }
      for (const [u, n] of Object.entries(res.grants)) upd[`grants.${u}`] = (deck.grants?.[u] || 0) + n;
      for (const [v, n] of Object.entries(res.discards)) upd[`discards.${v}`] = (deck.discards?.[v] || 0) + n;
      if (Object.keys(upd).length) tx.update(deckRef, upd);
      return res.state;
    });
  }

  /** 遭遇カードを山札から引く（手番プレイヤーのみ） */
  async function drawEncounter() {
    return runTransaction(db, async (tx) => {
      const rs = await tx.get(roomRef); const ds = await tx.get(deckRef);
      const room = rs.data(); const deck = ds.data();
      let rem = deck.encRemaining?.length ? deck.encRemaining : ENCOUNTERS.map((e) => e.id);
      const cardId = pick(rem);
      rem = rem.filter((c) => c !== cardId);
      const res = apply(JSON.parse(room.game.json), uid, { t: 'encounterDraw', cardId });
      tx.update(roomRef, gamePatch(room, res.state));
      tx.update(deckRef, { encRemaining: rem });
    });
  }

  /** 自分宛ての戦闘カード・目的カードを受け取る */
  async function claim() {
    return runTransaction(db, async (tx) => {
      const ds = await tx.get(deckRef); const ps = await tx.get(privRef);
      const deck = ds.data(); const priv = ps.exists() ? ps.data() : { hand: [], objectives: [] };
      const gN = deck.grants?.[uid] || 0, oN = deck.objGrants?.[uid] || 0;
      if (!gN && !oN) return false;
      let counts = { ...deck.counts }, discards = { ...deck.discards };
      const hand = [...(priv.hand || [])];
      for (let i = 0; i < gN; i++) {
        if (sum(counts) === 0) { counts = { ...discards }; discards = { 2: 0, 3: 0, 4: 0, 5: 0 }; }
        if (sum(counts) === 0) break;
        let r = Math.random() * sum(counts), v = 2;
        for (const k of [2, 3, 4, 5]) { if (r < counts[k]) { v = k; break; } r -= counts[k]; v = k; }
        counts[v]--; hand.push({ id: `c_${rid32()}`, value: v });
      }
      let objPool = [...(deck.objPool || [])]; const objectives = [...(priv.objectives || [])];
      for (let i = 0; i < oN && objPool.length; i++) { const o = pick(objPool); objPool = objPool.filter((x) => x !== o); objectives.push(o); }
      tx.set(privRef, { ...priv, hand, objectives }, { merge: true });
      tx.update(deckRef, { counts, discards, objPool, [`grants.${uid}`]: 0, [`objGrants.${uid}`]: 0 });
      return true;
    });
  }

  // ---- 戦闘（同時公開: 先にハッシュで確定 → 両者が確定したら公開） ----
  async function commitCombat(key, dial, cardIds) {
    const ps = await getDoc(privRef); const priv = ps.data() || { hand: [] };
    const cards = cardIds.map((id) => priv.hand.find((c) => c.id === id)?.value).filter(Boolean);
    const choice = { dial, cards };
    const nonce = rid32();
    const hash = await commitChoice(choice, nonce);
    await setDoc(privRef, { combat: { key, choice, nonce, cardIds, removed: false } }, { merge: true });
    await setDoc(combatRef(key), { commits: { [uid]: hash } }, { merge: true });
  }
  async function revealCombat(key) {
    const ps = await getDoc(privRef); const priv = ps.data();
    const c = priv?.combat;
    if (!c || c.key !== key) return;
    await setDoc(combatRef(key), { reveals: { [uid]: { choice: c.choice, nonce: c.nonce } } }, { merge: true });
    if (!c.removed) {
      const hand = (priv.hand || []).filter((x) => !c.cardIds.includes(x.id));
      await setDoc(privRef, { hand, combat: { ...c, removed: true } }, { merge: true });
    }
  }
  async function verifyReveal(key, who, data) {
    const r = data?.reveals?.[who], h = data?.commits?.[who];
    if (!r || !h) return null;
    return (await commitChoice(r.choice, r.nonce)) === h ? r.choice : false;
  }

  return { dispatch, drawEncounter, claim, commitCombat, revealCombat, verifyReveal, roomRef, deckRef, privRef, combatRef };
}

/** ゲーム開始時の山札ドキュメント */
export function initialDeck(players) {
  return {
    counts: { 2: 16, 3: 12, 4: 8, 5: 6 }, discards: { 2: 0, 3: 0, 4: 0, 5: 0 },
    grants: Object.fromEntries(players.map((p) => [p.uid, p.combatCards])),
    objPool: OBJECTIVES.map((o) => o.id).sort(() => Math.random() - 0.5),
    objGrants: Object.fromEntries(players.map((p) => [p.uid, p.objectives])),
    encRemaining: ENCOUNTERS.map((e) => e.id),
  };
}
