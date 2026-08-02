# 引き継ぎ資料 — intern2026 / testtriumph

最終更新: 2026-08-03（JST）
このファイルは、作業が中断・引き継ぎされても同じ品質で続けられるようにするための
「前提・現状・手順・注意点」の全部入りメモです。まずここを読んでください。

---

## 0. 30秒サマリ

- `trhyuga/intern` は**インターン運用リポジトリ**。Vercel連携で main にpushすると自動公開される。
- `intern2026/` が年度フォルダ。インターン生は自分だとわかるフォルダを作って成果物を置く。
- `intern2026/testtriumph/` は**テストケース（テスト用インターン「日向社長」）のフォルダ**。
  中身は縦スクロールシューティング **NEON VANGUARD**（単一 `index.html` で動く）。
- **v1.0 が「一旦の完成形」**。タグ `v1.0` と `testtriumph/v1.0/index.html` で凍結済み。いつでも戻せる。
- 2026-08-03 は「**1日かけて自由に面白く改造する日**」。v2.0 として I1〜I5 を実装・デプロイ済み。
  締切 **2026-08-03 23:59 JST**。それまで 計画→実装→テスト→評価 のループを回し続ける。

---

## 1. 絶対に守る前提（ユーザー指示）

| # | 内容 |
|---|---|
| 1 | **インターン生の実名を書かない**。リポジトリは public。テスト用の「日向社長」表記のみ可。 |
| 2 | 作業範囲は **`intern2026/testtriumph/` の中だけ**。リポジトリ直下の `index.html`（トップページ）等は触らない。 |
| 3 | ファイル数は増やしてよい。 |
| 4 | **Teams・メールは使わない**。 |
| 5 | **本番URLは常に最新**にする（イテレーションごとにデプロイ）。 |
| 6 | 難易度方針: **今のバランス（NORMAL）は維持**し、上級者向けは別枠で足す。<br>「フル強化すれば初心者でも爽快にクリアできる」は不変の目標。 |
| 7 | 「面白くする」の優先順位は**こちらの判断に任された**（完全にお任せ）。 |
| 8 | ステージ数・敵の数・ボス仕様は好きに変えてよい。 |

---

## 2. URL とリポジトリ構成

- 本番（最新）: https://intern-xi-lilac.vercel.app/intern2026/testtriumph/
- v1.0 凍結版: https://intern-xi-lilac.vercel.app/intern2026/testtriumph/v1.0/
- リリース: https://github.com/trhyuga/intern/releases/tag/v1.0

```
intern2026/testtriumph/
├── index.html          ← ゲーム本体（約4,600行・これ1つで動く）
├── README.md           ← 仕様書＋ロールバック手順（v1.0時点。v2.0で要更新）
├── HANDOVER.md         ← このファイル
├── bgm/                ← BGM 10曲（ユーザー自作。差し替え不可・追加もしない）
│   opening.mp3 / stage1-3.mp3 / boss1-3.mp3 / chuboss.mp3 /
│   boss_final.mp3 / ending.mp3
└── v1.0/index.html     ← v1.0 凍結コピー（BGMパスのみ ../bgm/）
```

**BGMは10曲しかない**。ステージを増やすと曲が足りず流用になる点に注意（これが
「ステージ4・5追加」を見送って、難易度モードとBOSS RUSHに舵を切った理由のひとつ）。

---

## 3. 作業マシン上のファイル

| パス | 用途 |
|---|---|
| `/root/testtriumph/index.html` | **編集する本体**。ここを直す |
| `/mnt/user-data/outputs/index.html` | GitHubにアップする用のコピー（`file_upload` はこの配下しか渡せない） |
| `/root/release/v1.0/index.html` | v1.0 凍結コピー（BGMパス `../bgm/`） |
| `/root/PLAN.md` | イテレーション計画と進捗ログ |
| `/root/t_*.cjs` | Playwright 回帰テスト群（下記） |
| `/root/shots/*.png` | 検証用スクリーンショット |

---

## 4. デプロイ手順（この手順以外はうまくいかない）

GitHubのWebエディタに直接タイプすると自動補完でコードが壊れるため、**必ずファイルアップロード**を使う。

```
1. cp /root/testtriumph/index.html /mnt/user-data/outputs/index.html
2. navigate → https://github.com/trhyuga/intern/upload/main/intern2026/testtriumph
3. find「choose your files upload input」→ ref を取得（毎回取り直すこと。ref_152 のことが多いが変わる）
4. file_upload(paths=["/mnt/user-data/outputs/index.html"], ref=...)
5. javascript_tool で:
   const i=document.querySelector('input[name="message"], #commit-summary-input');
   i.focus(); i.value='コミットメッセージ'; i.dispatchEvent(new Event('input',{bubbles:true}));
   [...document.querySelectorAll('button')].filter(x=>x.textContent.trim()==='Commit changes')[0].click();
6. 10秒待って Vercel の再デプロイ完了。確認は URL に ?v=数字 を付けてキャッシュ回避。
```

**注意**: 座標クリックで "Commit changes" を押すのは高確率で失敗する。必ず上記の
`javascript_tool` でボタンを取得してクリックすること。

---

## 5. テスト（回帰スイート）

すべて `cd /root && node t_XXX.cjs`。Playwright + Chromium（CommonJS `.cjs` 必須。ESM importは動かない）。

| ファイル | 検証内容 | 項目数 |
|---|---|---|
| `t_feel.cjs` | グレイズ／チェイン／ヒットストップ | 9 |
| `t_wpn.cjs` | 武器3種の三すくみ（DPS実測）と貫通の重複ヒット防止 | 7 |
| `t_mode.cjs` | 難易度の解放条件・スケーリング・BOSS RUSH通し | 10 |
| `t_new.cjs` | 新敵3種の挙動、分裂弾、盾の方向判定、一時強化バフ | 9 |
| `t_rec.cjs` | モード×難易度別ベストスコア記録 | 5 |
| `t_rank3.cjs` | クリアランク Z/S/A/B/C とエンドロール条件 | 9 |
| `t_leak.cjs` | データ初期化で状態が残らないか | 10 |
| `t_v28.cjs` | 常時オーバードライブ購入・エンドロール | 11 |
| `t_v25.cjs` | 敵の着地ワープ防止・演出中の停戦 | 18 |
| `t_multitouch.cjs` | マルチタッチ操作（ボム同時押し） | 12 |
| `t_v23.cjs` | 演出スクリーンショット（エラー0確認） | - |
| `t_smoke2.cjs` | フルクリア通し（**2分近くかかる。timeout 170 で単独実行**） | - |

一括: `for t in t_rec t_new t_mode t_wpn t_feel t_rank3 t_leak t_v28 t_v25 t_multitouch; do printf "%-12s %sP\n" "$t" "$(node $t.cjs 2>&1|grep -cE '^PASS')"; done`

構文チェック（速い）:
`node -e "const s=require('fs').readFileSync('/root/testtriumph/index.html','utf8'); new Function(s.split('<script>')[1].split('</script>')[0]); console.log('OK')"`

---

## 6. v1.0（一旦の完成形）の仕様

### 基本
- 論理解像度 480×800、DPR対応。単一HTML、外部依存なし（BGMのmp3のみ）。
- 操作: **相対ドラッグ**（指を置いた位置から動かした方向に自機が動く／マルチタッチ対応）＋キーボード。
- セーブ: localStorage キー `neon_vanguard_save_v1`。
- 3ステージ（各: 中ボス→ボス）＋ 3面ボスが変身する大ボス OMEGA CORE。

### 強化9種（`UPGRADES`）
メインショット6 / 連射速度5 / 火力6(+1) / 僚機2 / 装甲5 / シールド3(+1) / ボム3 / ホーミング3(+1) / クレジット獲得4。
全カンストまで約73,000c。説明は**すべて実数値付き**（`desc()`=ショップ用短縮 / `spec()`=エンドロール用詳細）。

### 機体形式（`SHIP_MARKS` / `shipMark()`）
`メインショットLv×2 + 火力Lv + 連射Lv` の合計で MK-I〜MK-V に進化。見た目が段階的に変わる。

### オーバードライブ
OVERDRIVE(+30%) → 限界突破解放 → OVERDRIVE+(+40%) → 常時オーバードライブ(◈100,000c)。

### クリアランク（`clearRank()` / `RANK_INFO`）
| ランク | 条件 | エンドロール | FIN |
|---|---|---|---|
| Z | 常時OD＋フル強化で大ボス撃破 | あり（約40秒） | あり |
| S | OVERDRIVE+ で撃破 | なし | なし |
| A | OVERDRIVE で撃破 | なし | なし |
| B | 通常形態で撃破 かつ 50,000点以上 | なし | なし |
| C | 50,000点未満 | なし | なし |

---

## 7. 2026-08-03 の v2.0 改造（済み・すべて本番反映）

### I1 手触りの核
- **グレイズ**: 敵弾を半径 `GRAZE_R=30` 以内でかわすと1発1回カウント。
  `GRAZE_PER_BOMB=70` 回でボム+1（満載なら+500点）。実装は `collisions()` 内。
- **チェイン**: 連続撃破で加算、`CHAIN_HOLD=130`フレーム途切れるとリセット。
  スコア最大 `CHAIN_MAX_MUL=4.0` 倍、クレジット最大1.5倍（`chainScoreMul()` / `chainCredMul()`）。
- **ヒットストップ**: `Game.hitStop` フレーム数ぶん `loop()` で `Game.dt *= 0.07`。
  被弾4 / ボム5 / 大型敵撃破2。
- HUD: 右上にチェイン倍率＋残り時間バー、左下にGRAZE数とボムチャージ。

### I2 武器タイプ3種（`WEAPONS` / `playerFire()`）
強化レベルは共通、**撃ち方だけ**が変わる。格納庫のタブで切替（`Save.data.wpn`）。

| | 弾 | 定数 | 性格 |
|---|---|---|---|
| VANGUARD 扇 | 従来の扇 | rate 1.00 | 近づくほど束が集中して最大火力 |
| LANCE 貫通 | `LANCE_N=[1,1,2,2,3,3,4]` 本 | `LANCE_DMG=2.2` / `LANCE_PIERCE=4` / rate 1.25 | 距離不問、縦に並んだ敵を貫く |
| SWARM 追尾 | 扇と同数の誘導弾 | `SWARM_DMG=0.63` / rate 1.25 | 必中。散開した敵とチェイン稼ぎ |

実測DPS（フル強化・僚機/ホーミング無効）:
近距離ボス V8206 / L8600 / S6686、遠距離 V3417 / L8371 / S6470。
掃討（散開した12体） V176f / L3000f(timeout) / S145f。**三すくみを `t_wpn.cjs` で常時検証**。

貫通は `b.pierce` と `b.seen[uid]` で同じ敵への重複ヒットを防ぐ。敵には `uid`（`ENEMY_UID`）を付与済み。

### I3 難易度＋BOSS RUSH
- `DIFFS`: NORMAL / HARD(クリアで解放) / NIGHTMARE(HARDクリアで解放・シールド自動回復なし)。
  敵HP・敵ダメージ・敵弾速度・クレジット・スコアに倍率。`Save.data.diff` / `clearedDiff`(ビットマスク)。
- **BOSS RUSH**: `RUSH_ORDER` の7体を連戦するタイムアタック。`Game.mode==='rush'`、
  `Director.rush` で分岐、ベストタイムは `Save.data.rushBest`（フレーム）。

### I4 新敵3種＋一時強化アイテム3種
- **プリズム(prism)**: 撃った弾が `split` フラグで52フレーム後に3方向へ割れる。
- **ハンター(hunter)**: `e.hs='dive'/'back'` で急降下と離脱を繰り返す。
- **バルワーク(bulwark)**: `e.guard=1`。**上から来た自機弾（vy<0 かつ横位置が盾の内側）は弾かれる**。
  横か背後から当てる必要がある。
- アイテム **P(POWER 火力×1.6) / R(RAPID 連射×1.7) / T(SLOW 敵弾半速)**、各15秒（`BUFF_DUR`）。
  `Game.buffs` に残りフレーム。効果は `buffPower()` / `buffRapid()` / `buffSlow()`。

### I5 記録
- `Save.data.rec['camp_0'..'camp_2','rush_0'..]` にモード×難易度ごとのベストスコア。
- ゲームオーバー／クリア画面に戦績（最高チェイン・グレイズ・武器・難易度）と BEST / ★NEW RECORD。
- タイトルに難易度別ベスト一覧とラッシュのベストタイム。

---

## 8. コードの地図（`/root/testtriumph/index.html`・行番号は目安）

| 行 | 内容 |
|---|---|
| 156 | `Sound`（WebAudio簡易シンセ。`graze()` `chainUp()` などもここ） |
| 389 | `Music`（mp3再生。`gen`カウンタで二重再生を防止） |
| 487 | `Save`（localStorage） |
| 512-606 | 強化定義 `UPGRADES`、武器 `WEAPONS`、上限/コスト計算 |
| 609 | `playerStats()`（`fireIntervalAt()` `dmgAt()` `SHIELD_*` を参照） |
| 843 | `Game`（状態・launch/beginStage/endRun/clearRunFlags など） |
| 1141 | `ENEMY_DEF` 全16機種 |
| 1186 | `updateEnemy()` — 機種ごとの挙動 |
| 1359 | チェイン/グレイズの定数と倍率関数 |
| 1394 | パワーアップとバフ |
| 1454 | `STAGES` / `BOSS_NAMES` / `MID_NAMES` |
| 1467 | `DIFFS`（難易度） |
| 1486 | ステージ別スケール `HP_MUL` 他 |
| 1512 | `Director`（進行管理。`rush` 分岐あり） |
| 1584 | `buildScript(stage)` — ステージのウェーブ台本 |
| 1656 | `makeBoss()` / ボス生成・撃破シーケンス |
| 1871-1912 | ボスの弾幕パターン工場（`fAimN` `fRing` `fSpiral` `fSnake` ほか） |
| 2172 | `playerFire()` — **武器3種の分岐はここ** |
| 2274 | `collisions()` — 貫通・グレイズ・盾判定はここ |
| 2335 | `updatePlay()` |
| 2465 | `shipMark()` / `SHIP_MARKS` / `drawShipBody()`（MK-I〜V の分岐） |
| 2829 | `drawEnemy()` — 全機種の描画 |
| 3260 | `drawHUD()` |
| 3626 | `drawHangar()` — 武器タブ・難易度タブ・BOSS RUSHボタン |
| 3847 | `buildCreditRoll()` — エンドロールの内容は**実データから自動生成** |
| 4026 | `RANK_INFO` / `clearRank()` |
| 4044 | `drawWin()` — FINはZランクのみ |
| 4372 | `drawCinematic()` — 登場カットイン |
| 4564 | `loop()` — ヒットストップと発光品質の自動調整 |

---

## 9. 落とし穴（過去に踏んだもの。同じ轍を踏まない）

1. **`shadowBlur` は極端に重い**。特に `globalCompositeOperation='lighter'` と併用すると致命的
   （噴射炎を毎フレーム描いて 474ms/frame になった）。→ 炎は `flameSprite()` でオフスクリーンに
   焼いて `drawImage` するだけにした。新しい発光表現を足すときも同じ方針で。
2. **`GLOWQ`** による自動品質調整が `loop()` にある。新しい `ctx.shadowBlur=N` は必ず `gq(N)` を通す。
3. **敵の着地ワープ**: 降下中も `e.t` が進むため、着地した瞬間に `sin(e.t*k)` が飛ぶ。
   → `enterDone(e)` で `e.mt=0` にし、`wobRamp(e)` で振幅を立ち上げること。ボスは `b.moveT`。
4. **演出中の停戦**: `cineLock()` が true の間は `eb()` が弾を出さず、`collisions()` も早期リターン、
   `updateBoss()` も攻撃しない。新しい攻撃経路を足すときはここを通るか確認する。
5. **`eb()` は opt を明示的にコピーしている**。新しい弾プロパティ（`split` など）を足したら
   `eb()` の push オブジェクトにも追加すること。忘れると無言で消える。
6. **iOSでは `audio.volume` が効かない**。ミュートは stop/resume で実装済み。
7. **Playwright はソフトウェア描画**なので絶対値のfpsは当てにならない。**相対比較**で判断する。
8. **`t_smoke2.cjs` は約2分**かかる。他のテストと同じコマンドに混ぜるとタイムアウトする。
9. GitHubの座標クリックは失敗しやすい → `javascript_tool` でボタンを取得してクリック。

---

## 10. 残っている計画（優先順）

- **I6 バランス実測**: チェイン/グレイズ導入で NORMAL が簡単になりすぎていないか、
  HARD/NIGHTMARE が理不尽でないかを自動計測（フル強化時・中盤強化時のクリア可否とHP残量）で確認して調整。
- **I7 演出**: チェイン節目の画面演出、ボス撃破のスローモー、グレイズ多発時の残像など。
- **I8 仕上げ**: `README.md` を v2.0 用に更新、リリースタグ `v2.0` 作成、全回帰＋実機確認。

余力があれば:
- ステージ内ウェーブの再構成（新敵を活かした配置の作り込み）
- ボスに新パターン追加（`bossPatterns()` に工場関数を足すだけで済む）
- 実績（アチーブメント）システム

---

## 11. ロールバック

何かおかしくなったら **v1.0 に戻せる**。手順3種は `README.md` に記載。最短は
`intern2026/testtriumph/v1.0/index.html` をダウンロード → `'../bgm/` を `'bgm/` に一括置換（5か所）
→ `intern2026/testtriumph/index.html` として Upload files で上書き。
