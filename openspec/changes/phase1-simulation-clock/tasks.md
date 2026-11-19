# Tasks

## 1. 決定論コア（game-core）

- [x] 1.1 【目的】決定論的な乱数基盤を作る 【対象】src/engine/core/rng.ts, tests/unit/rng.test.ts 【作業】PCG32実装・hash派生（fnv1a）・子ストリームAPIを書く。Math.random不使用を確認 【テスト】同一シード100万回生成の系列一致・異なるsystemNameで系列が異なること 【期待値】seed=12345の最初の5出力が固定値と一致 【完了】unit test全緑＋lint（Math.random禁止ルール）有効化
- [x] 1.2 【目的】SoA状態コンテナを作る 【対象】src/engine/core/state.ts 【作業】WorldState（tick/seed/rng/stores/derivedCache）の型とストアレジストリ、typed array ヘルパを実装 【テスト】ストア登録・参照・ID範囲外アクセスで例外 【期待値】登録順が安定し、ストア一覧の順序が決定論的 【完了】unit test全緑
- [x] 1.3 【目的】コマンドパイプラインを作る 【対象】src/engine/core/command.ts 【作業】Command型・レジストリ（validate/apply登録）・FIFO適用・ジャーナル（uid二重適用防止）を実装 【テスト】無効コマンドが却下されジャーナルに理由記録・同一uidの再適用が拒否 【期待値】docs/16 A系テストの基盤動作 【完了】unit test全緑
- [x] 1.4 【目的】スケジューラを作る 【対象】src/engine/core/scheduler.ts 【作業】システム登録（cadence/offset/enabled）、offset=hash(name)%N、実行順固定を実装 【テスト】7つの週次システムが異なるtickに実行される 【期待値】同一tickに全週次システムが集中しない 【完了】unit test全緑
- [x] 1.5 【目的】トレース型を作る 【対象】src/engine/core/trace.ts 【作業】contributors型（label/value/formula）とtrace純関数ヘルパを実装 【テスト】戦闘力のサンプル関数でcontributors生成 【期待値】traceが要求時のみ計算される（pull型） 【完了】unit test全緑
- [x] 1.6 【目的】決定論lintの整備 【対象】eslint.config.mjs, scripts/check-determinism.mjs 【作業】Math.random・Math.sin等の禁止ルール、Date使用禁止（src/engine配下）を設定 【テスト】違反コードでlint失敗すること 【期待値】CIで決定論規律が自動検査される 【完了】lint実装＋CI設定

## 2. 時間進行（simulation-clock）

- [x] 2.1 【目的】固定Tickと日付変換を作る 【対象】src/engine/clock/date.ts, src/engine/clock/clock.ts 【作業】daysFromCivil/civilFromDaysの整数実装・tick進行・epoch管理 【テスト】閏年・年跨ぎ・1936〜2100年の境界テスト 【期待値】2026-01-01 + 100tick = 2026-04-10相当 【完了】unit test全緑
- [x] 2.2 【目的】速度切替と一時停止を作る 【対象】src/engine/clock/clock.ts 【作業】speed(0|1|2|4|8)/paused状態・コマンド受付継続を実装 【テスト】一時停止中のコマンドがキューに残り、再開後最初のtickで適用 【期待値】docs/16 シナリオ「時間操作」通過 【完了】unit test全緑
- [x] 2.3 【目的】進行レートの自動抑制を作る 【対象】src/engine/clock/clock.ts 【作業】tick処理時間計測・予算超過時の抑制・遅延警告フラグ公開 【テスト】人工的に遅いシステムで抑制が発動 【期待値】警告フラグがUIに公開される（表示はChange 7） 【完了】unit test全緑

## 3. 決定論の検証基盤

- [x] 3.1 【目的】ハッシュアンカーを作る 【対象】src/engine/core/hashAnchor.ts 【作業】月末状態ハッシュ（FNV-1a逐次）の記録・照会API 【テスト】同一シード2回実行で全アンカー一致 【期待値】1,000tick×2回でアンカー完全一致 【完了】unit test全緑
- [x] 3.2 【目的】リプレイ二重実行テストを入れる 【対象】tests/golden/replay.test.ts 【作業】seed+コマンド列を2回実行してアンカー比較するゴールデン形式テストを実装 【テスト】CI実行 【期待値】常に一致（不一致はCI失敗） 【完了】CI緑
- [x] 3.3 【目的】プロパティテストを入れる 【対象】tests/property/invariants.test.ts 【作業】fast-checkで INV-3/6（コマンド経由・二重適用なし）を検証 【テスト】1,000ランダムシード 【期待値】全通過 【完了】CI緑
- [x] 3.4 【目的】ベンチハーネスの雛形を作る 【対象】packages/bench/src/run.ts 【作業】Node上で1,000tick実行しtick中央値/p99をstdoutにJSON出力 【テスト】手動実行で数値が出る 【期待値】ティアSダミーストアでtick中央値<1ms（ダミー） 【完了】実行結果を docs/13 実測欄に記録できる形式
