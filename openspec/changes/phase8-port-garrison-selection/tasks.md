# Tasks

- [x] 【目的】防衛対象の根拠を固定 【対象】`src/ui/garrisonPortTargets.ts` 【作業】カタログ中の自国支配港だけを抽出し、重複と64地点上限を検証 【テスト】Vitestの所有権・重複・境界値 【期待値】対象を決定論的に選択 【完了条件】純粋関数と失敗時nullを実装
- [x] 【目的】港湾防衛の導線を追加 【対象】`src/ui/GameScreen.tsx`・`src/ui/ArmyCommandDock.tsx` 【作業】港メタデータを受け取り既存ドラフトに一括追加、支配権変化で作成を禁止 【テスト】Playwright作戦作成 【期待値】非港沿岸州の混入を防止 【完了条件】カタログ連携と導線
- [x] 【目的】回帰検出 【対象】`tests/unit/garrison-port-targets.test.ts`・`tests/pages/area-garrison-dock.spec.ts` 【作業】正常・境界・他国港・ゲームUIの実行経路を検証 【テスト】Vitest / Playwright 【期待値】港が重複せず正常に駐屯が作成される 【完了条件】テストケース追加
- [ ] 【目的】仕様の整合確認 【対象】`openspec/changes/phase8-port-garrison-selection/` 【作業】strict仕様検証と差分レビュー 【テスト】Specification Design CI 【期待値】不整合なし 【完了条件】strict成功
- [ ] 【目的】マージ品質の確保 【対象】PRとCI 【作業】typecheck、Vitest、build、Playwright、差分と未解決指摘を確認 【テスト】Check CI 【期待値】全項目成功 【完了条件】成功HEADでSquashマージ
