# Tasks

## 1. AI基盤

- [x] 1.1 【目的】週次思考ループを作る 【対象】src/engine/ai/loop.ts 【作業】国家ID順の週次走査（7日分散: countryIndex%7）・モジュール実行順固定・思考時間上限（超過でスキップ・繰延） 【テスト】250国ダミーで全tick思考国数が分散されること 【期待値】baseline「分散スケジューリング」通過 【完了】unit test緑
- [x] 1.2 【目的】Utility評価フレームを作る 【対象】src/engine/ai/utility.ts 【作業】features→score計算・誤差注入（決定論シード派生）・選択・理由記録 【テスト】同一シードで同一選択、難易度パラメータで選択分布が変わる 【期待値】baseline「難易度の判断能力表現」通過 【完了】unit test緑
- [x] 1.3 【目的】判断ログを作る 【対象】src/engine/ai/decisionLog.ts 【作業】リングバッファ（国家ごと1,000件）・照会API（開発者モード用） 【テスト】記録と照会・バッファ回転 【期待値】baseline「判断ログの記録」通過 【完了】unit test緑

## 2. MVPモジュール

- [x] 2.1 【目的】国家戦略AIを作る 【対象】src/engine/ai/strategy.ts 【作業】国庫・安定度・脅威認知からスタンス（拡張/防衛/休養）を決定 【テスト】脅威が高い国が防衛スタンスになる 【期待値】docs/16「AIの自律行動」の基盤 【完了】unit test緑
- [x] 2.2 【目的】軍事AIを作る 【対象】src/engine/ai/militaryAI.ts 【作業】影響力マップ（国境近接敵軍）・戦線割当・攻勢判断（utility: 敵戦力比・補給状態）・宣戦判断（CB保有時のみ） 【テスト】弱小隣国にCB保有時のみ宣戦する・開戦国へ師団を割当する 【期待値】docs/16「AIの自律行動」通過 【完了】unit test緑
- [x] 2.3 【目的】経済・外交簡易AIを作る 【対象】src/engine/ai/economyAI.ts, diplomacyAI.ts 【作業】装備不足→生産確保コマンド・外交提案の受諾判定（関係値閾値） 【テスト】装備不足で生産コマンド発行 【期待値】AIコマンドが全て検証を通る（INV-3） 【完了】unit test締め
- [x] 2.4 【目的】AI統合シナリオテストを作る 【対象】tests/golden/aiFlow.test.ts 【作業】シード付き50年でAI国家が消滅せず・行動し続けること、リプレイ一致 【テスト】CI 【期待値】docs/16 Q-6/現行シナリオ通過 【完了】CI緑
