# 大鎌戦役 オンライン（基本セット・人間のみ）

静的サイト（GitHub Pages）＋ Firebase（匿名認証・Firestore、無料Spark）。Cloud Functionsは使いません。
改ざん・不正アクセスの防止は `firestore.rules` が担います。

## 現在できること
- ルーム作成/参加、勢力→マットのカスタムドラフト、ゲーム進行（手番・移動・戦闘・遭遇・工場・目的・得点）
- 盤面は公式盤面画像（public/img/map.jpg）の上にヘクス判定を重ねて表示。行動マット・国マットの絵を背景に、セクション選択と生産選択をその上で行う
- 遭遇カード74枚・目的カード27枚（資料v1.2。非公式仮案は「仮案」表示）、工場カード18枚（画像の絵柄からの暫定解釈）
- `npm test`（エンジン・ランダムプレイ）、`node tests/ui/run.mjs`（画面の描画確認）

## 既知の制限
- 川の位置は盤面画像からの推定。ずれている場合は `public/js/engine/board-data.js` の rivers を直す
- 遭遇カードの一部（カウンター・メック移動・キャラ再配置・相手への効果など）は「未実装」表示で選べない
- 工場カードの効果は絵柄からの暫定解釈。戦闘カードを費用にする場合は手札の低い値から自動で捨てる
- アルビオン／トガワ（7人目まで）は未対応

## セットアップ
1. Firebaseコンソールでプロジェクトを作成（Spark）。Authentication で「匿名」を有効化。Firestore Database を作成。
2. プロジェクトの設定 > マイアプリ(Web) の設定値を `public/js/firebase-config.js` に貼る。
3. Authentication > 設定 > 承認済みドメイン に `<ユーザー名>.github.io` を追加。
4. ルールを反映: `npm i -g firebase-tools && firebase login && cp .firebaserc.example .firebaserc`（IDを編集）`&& firebase deploy --only firestore:rules`
5. GitHubにpush（mainブランチ）。リポジトリの Settings > Pages > Source を「GitHub Actions」にする。
6. 公開URL: `https://<ユーザー名>.github.io/<リポジトリ名>/`

## セキュリティ方針（Spark）
- 参加者以外はルームを読めない／一覧取得不可／削除不可
- 手札などは `private/{uid}` に置き本人のみ読める
- ドラフト希望は全員提出後にのみ公開
- 書き込みは revision+1 のみ（古い画面の上書き防止）、ゲーム中は手番プレイヤーのみ更新可
- ルールの完全検証はしません（改造クライアントによるルール違反は防げません）
