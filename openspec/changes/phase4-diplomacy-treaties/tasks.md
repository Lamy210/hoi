# Tasks: phase4-diplomacy-treaties

- [x] 1.1 【目的】Treaty型・条約ヘルパ（activeTreatyBetween・annulTreatiesBetween等）をdiplomacy/treaties.tsに実装する
- [x] 1.2 【目的】多要素関係値（target計算・contributors・脅威認知・イデオロギー距離）とトレースAPIを実装する
- [x] 1.3 【目的】proposeTreaty/acceptTreaty/declineTreaty/annulTreatyコマンド（AI即時判断・矛盾検証）を実装する
- [x] 1.4 【目的】宣戦時の不可侵自動解除・同盟国への宣戦却下・戦争終結時の条約解除を実装する
- [x] 1.5 【目的】週次外交システム（条約期限切れ・関係値ドリフト）を登録する
- [x] 1.6 【目的】条約効果（貿易量1.5倍・access移動・外交スコア加算）を経済/移動/スコアに接続する
- [x] 1.7 【目的】AI外交判断（条約提案・受諾）とdecisionLog記録を実装する
- [x] 1.8 【目的】UI外交パネル（関係・トレース・条約・受諾待ち）とi18nを追加する
- [x] 1.9 【目的】セーブv4（treaties）と往復テストを更新する
- [x] 1.10 【目的】unit/integration/propertyテストを書く

## 実装結果（2026-11-19）

- 全タスク完了。`diplomacy/treaties.ts`（条約ライフサイクル・多要素関係値D-040〜D-043・AI判断）、`systems/diplomacy.ts`（週次: 期限切れ→ドリフト±2/週）、コマンド4種、宣戦時自動解除/同盟宣戦却下（'allied'）、貿易1.5倍・通行権・外交スコア加算、UI外交パネル（関係/条約タブ+トレース）、i18nキー差分ゼロ、セーブv4。
- テスト: 統合7件（締結・重複禁止・proposed受諾・同盟宣戦却下・不可侵自動解除・ドリフト漸近・トレース/ペア判定）＋プロパティ2件（矛盾条約不存在・contributors範囲）が緑。
