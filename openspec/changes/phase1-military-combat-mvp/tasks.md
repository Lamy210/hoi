# Tasks

## 1. military-system 実装

- [x] 1.1 【目的】UnitStore（師団SoA）を作る 【対象】src/engine/military/unitStore.ts 【作業】SoA配列（owner/location/org/strength/manpower/equipment/stance）とライフサイクル（mobilizing→deployed→destroyed） 【テスト】状態遷移のunit test 【期待値】負のmanpower/equipmentが発生しない（INV-4） 【完了】unit test緑
- [x] 1.2 【目的】師団作成コマンドを作る 【対象】src/engine/military/commands.ts 【作業】徴兵プール＋装備（歩兵装備）の実消費・不足時拒否を実装 【テスト】人力不足で却下・装備不足で却下 【期待値】docs/16「部隊作成と移動」通過 【完了】unit test緑
- [x] 1.3 【目的】移動システムを作る 【対象】src/engine/military/movement.ts 【作業】合法性検証（隣接・海越え禁止・未開戦敵地禁止）・A*経路・移動時間（エッジコスト×補給係数） 【テスト】海越え拒否・敵地直進拒否・正常移動の到着時間 【期待値】docs/16「部隊作成と移動」「移動の合法性」通過 【完了】unit test緑
- [x] 1.4 【目的】宣戦コマンドを作る 【対象】src/engine/military/war.ts 【作業】WarStore（participants/startTick/casusBelli/warScore/status）・CB有無のペナルティ適用・不可侵条約自動解除（Phase 4の条約はまだ無いので将来フック） 【テスト】CBあり/なしの安定度・影響力変化 【期待値】docs/16「宣戦と戦闘」通過 【完了】unit test緑
- [ ] 1.5 【目的】戦線の簡易版を作る（実装方法変更: Phase 1ではAIが州単位で直接割当・プレイヤーは個別命令。戦線オブジェクトとスタンスUIはユーザーロードマップどおりPhase 2へ） 【対象】src/engine/military/fronts.ts 【作業】国境区間への師団割当・スタンス（防衛/攻勢）・明示命令の優先保護 【テスト】明示命令を持つ師団を戦線AIが上書きしない 【期待値】baseline「戦線指示と優先規則」通過 【完了】unit test緑

## 2. combat-system 実装

- [x] 2.1 【目的】バトル解決を作る 【対象】src/engine/combat/battle.ts 【作業】プロヴィンスバトル（前面幅・予備）・日次損耗（地形/補給/装備/組織率/決定論ロール）・contributors完全記録 【テスト】ゴールデン（同一入力→同一損耗列）・境界値（org 0/100・補給0） 【期待値】docs/16「宣戦と戦闘」「戦闘結果の整合性」通過 【完了】unit+golden test緑
- [x] 2.2 【目的】撤退処理を作る 【対象】src/engine/combat/retreat.ts 【作業】org<20%で強制撤退（味方隣接へ）・撤退先なしで包囲へ移行 【テスト】撤退先あり/なしの遷移 【期待値】baseline「撤退と包囲」通過 【完了】unit test緑
- [x] 2.3 【目的】占領処理を作る 【対象】src/engine/combat/occupation.ts 【作業】防衛軍不在の攻撃側支配14日でcontroller移転（occupyProvinceコマンド）・dirty発行 【テスト】14日タイマ・講和解決でタイマ解除 【期待値】docs/16「占領」通過 【完了】unit test緑

## 3. logistics-system 実装

- [x] 3.1 【目的】簡易補給を実装する 【対象】src/engine/logistics/supplyGraph.ts 【作業】ソース（首都）からのDijkstra・距離減衰・capacityFactor・週次＋dirty再計算 【テスト】遮断シナリオ（隘路占領→下流0）・radius境界 【期待値】baseline「補給効率の計算」「補給網の遮断」通過 【完了】unit test緑
- [x] 3.2 【目的】消費側適用を作る 【対象】src/engine/logistics/effects.ts 【作業】org回復×(0.2+0.8s)・戦闘係数×(1-0.5(1-s))・移動×(0.5+0.5s)・s<0.5で装備損耗の適用（military/combatとの接続） 【テスト】s=0/0.5/1.0の境界テスト 【期待値】効果式がトレースに記録される 【完了】unit test緑
- [x] 3.3 【目的】包囲崩壊を実装する 【対象】src/engine/combat/encirclement.ts 【作業】supplyEff=0の師団のorg回復停止・崩壊損耗・期間経過後降伏（全損） 【テスト】包囲→降伏までのフローテスト 【期待値】baseline「包囲による降伏」通過 【完了】unit test緑

## 4. パック拡張と統合

- [x] 4.1 【目的】装備財をパックに追加する（実装方法変更: D-016により抽象装備ストック。財市場化はPhase 3） 【対象】public/assets/scenarios/modern-eastasia/ 【作業】歩兵装備財・軍需工場の初期産出設定（MVPは固定産出）・SOURCES.json更新 【テスト】ロード統合テスト 【期待値】師団作成が市場の装備を消費する 【完了】integration test緑
- [x] 4.2 【目的】軍事統合シナリオテストを作る 【対象】tests/golden/militaryFlow.test.ts 【作業】開始→作成→移動→宣戦→戦闘→占領→包囲の一連フローをシード付きで実行しアンカー照合 【テスト】CI実行 【期待値】docs/16の軍事系シナリオ全通過＋リプレイ一致 【完了】CI緑

## 実装結果（2026-11-14）

- 1.5を戦線オブジェクトのPhase 2繰り込みとし、4.1は抽象ストック方式で達成。他は全完了（統合シナリオテスト＝tests/integration/engine.test.ts の戦争フロー）。
