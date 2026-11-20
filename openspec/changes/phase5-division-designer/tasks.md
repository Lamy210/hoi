# Tasks（PR #11マージ済み、5B先行スライス着手）

- [ ] 0.2 目的: 非破壊の編成試算を実装。対象: military/templateStats.ts, worker.ts, engineClient.ts, DivisionDesignerPreview.tsx。作業: builtin-v1・純粋集計・RPC・通常UI。テスト: D01/D02・不正構成・試算前後の状態一致。期待値: 既存固定3編成の資源/日数一致、試算のみで日付や備蓄を変えない。完了条件: 最新HEADのCI合格と通常UI確認。pack定義/独自編成保存は後続。

- [ ] 0.1 目的: 横断契約を確定。対象: docs/20、acceptance.md、core/command.ts、worker.ts。作業: issuer/seq採番・旧履歴監査・v6割当・D15ケース追加。テスト: 400件超再送、復元。期待値: 新版命令の二重適用なし。完了条件: regression合格、旧版限界を文書化。
- [ ] 1.1 目的: 定義スキーマを固定。対象: scenario/types.ts, loader.ts, military/templates.ts。作業: カタログ・版・参照検証。テスト: 未知財/重複/上限。期待値: 不正拒否。完了条件: unit合格。
- [ ] 1.2 目的: 算出値共有。対象: military/templateStats.ts（新規）。作業: 純粋集計関数と旧3編成の数値表。テスト: 1/25大隊、0/5支援。期待値: 一意な有限値。完了条件: unit合格、数値表レビュー。
- [ ] 1.3 目的: 版付き編集。対象: core/state.ts, commands.ts。作業: 作成/改訂/削除の所有権・使用中保護。テスト: 他国/旧版保持。期待値: 意図しない部隊変更なし。完了条件: integration合格。
- [ ] 2.1 目的: 募集状態。対象: systems/training.ts。作業: queuedからtraining/ready、取消・再指定・配備。テスト: 予約保存則と占領。期待値: 重複配備/返却なし。完了条件: integration合格。
- [ ] 2.2 目的: 再編。対象: commands.ts。作業: 差分資源・戦闘中拒否・ペナルティ。テスト: 不足/余剰/損耗。期待値: 資源増殖なし。完了条件: property合格。
- [ ] 3.1 目的: 戦闘幅。対象: systems/combat.ts。作業: 幅単位・編成係数を統一。テスト: 旧標準/大小編成。期待値: 一貫した戦闘結果。完了条件: トレース・比較実測。
- [ ] 3.2 目的: 兵站。対象: systems/logistics.ts, movement.ts。作業: 編成需要/速度の統合。テスト: 遮断/複数師団。期待値: 効率0〜1。完了条件: 回帰合格。
- [ ] 3.3 目的: AI統合。対象: ai/ai.ts, commands.ts。作業: 即時作成を通常経路から除外。テスト: AI不足/訓練。期待値: 同じ制約。完了条件: 50年長期検証。
- [ ] 4.1 目的: 保存。対象: save/serialize.ts, core/hash.ts。作業: v4/v5移行・版/予約/進行の検証。テスト: 旧実ファイル、往復、破損。期待値: 資源整合。完了条件: integration合格。
- [ ] 4.2 目的: UI編集。対象: ui/panels.tsx, engine/ui.ts, i18n.ts。作業: プレビュー/編集/改訂確認。テスト: 日英・操作。期待値: 表示と計算一致。完了条件: Playwright合格。
- [ ] 4.3 目的: UI運用。対象: ui/panels.tsx, GameScreen.tsx。作業: 募集→配備→戦線、失敗表示。テスト: 停止・復元・配備喪失。期待値: 通常プレイ可能。完了条件: production E2E合格。
- [ ] 5.1 目的: リリース。対象: check.yml, docs/13。作業: strict、全回帰、acceptance.md D01〜D17の追跡、性能測定。テスト: CI/Pages。期待値: 合格、性能の実測記録。完了条件: 最新HEAD・実URL確認。

- [ ] 0.3 目的: 永続命令状態のv6先行実装を検証。対象: core/sequence.ts, command.ts, hash.ts, save/serialize.ts, worker.ts, engineClient.ts。作業: 番号上限、未適用AI命令の保存、v4/v5旧hash検証。テスト: D15/構造不正/継続一致。期待値: 400件超後の再送拒否、キュー復元、旧既知番号の復元。完了条件: 最新CI合格。旧実ファイルと全体移行は4.1で確認。

- [ ] 1.3a 目的: 自由師団編成の国家別作成・改訂・削除の先行実装。対象: military/customTemplates.ts, core/state.ts, commands.ts, core/hash.ts, save/serialize.ts, ui/DivisionDesignerPreview.tsx。作業: 楽観ロック、永続カタログ構成、v10移行、保存UI。テスト: D03〜D06の保存・改訂部分とUI、v9構造移行、破損拒否。期待値: 過去改訂保持、他国拒否、ID再利用なし。完了条件: PRの全CI成功。独自編成での募集・配備は2.1、全戦闘・兵站統合は3.xで継続。
