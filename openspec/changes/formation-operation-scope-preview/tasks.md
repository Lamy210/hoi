# Tasks
- [x] 目的: 所属・選択・状態別の対象抽出 / 対象: formationOverview.ts / 作業: 純関数と安定ID順 / テスト: Vitest / 完了条件: 所属外を含めず決定論的
- [x] 目的: 実変更件数の事前把握 / 対象: formationOverview.ts / 作業: 無変更IDを除外し手動固定解除数を算出 / テスト: Vitest / 完了条件: 既存戦線再指定でも解除を表示
- [x] 目的: 命令UIの誤操作防止 / 対象: FormationCommandCenter.tsx, ArmyManagement.tsx, styles.css / 作業: フィルタ・プレビュー・警告確認 / テスト: Playwright / 完了条件: 空対象・未確認解除は送信不能
- [x] 目的: 既存操作の継続 / 対象: tests/pages/formation-command-center.spec.ts / 作業: 全件操作と新フィルタの回帰 / テスト: Playwright / 完了条件: 既存E2E成功
- [ ] 目的: マージ品質確認 / 対象: PR, GitHub Actions / 作業: typecheck・Vitest・Playwright・OpenSpec・レビュー確認 / テスト: GitHub Actions / 完了条件: 全必須チェック成功後にSquashマージ
