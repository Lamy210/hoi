# Tasks
- [x] 【目的】駐屯優先度を明確化 【対象】`garrisonPriorities.ts` 【作業】敵隣接数・首都・沿岸・インフラ・人口で決定論的に順位付け 【テスト】Vitest 【期待値】交戦中の境界を優先し平時は首都優先 【完了条件】自国支配対象のみ返す
- [x] 【目的】限られた命令枠の有効活用 【対象】`garrisons.ts` 【作業】既存週次AIの対象走査を優先順位で行う 【テスト】Vitest 【期待値】重要目標を先に守る 【完了条件】経路・最後の守備・手動固定は既存制約維持
- [x] 【目的】説明可能性 【対象】`garrisonRouteDiagnostics.ts`・`ArmyCommandDock.tsx` 【作業】診断に順位・主要因を渡す 【テスト】Vitest/Playwright 【期待値】港と沿岸を混同しない 【完了条件】日本語/英語で表示
- [x] 【目的】セーブ互換と決定論 【対象】`tests/integration/garrison-priorities.test.ts` 【作業】平時・戦時・タイブレーク・再ロードを検証 【テスト】Vitest 【期待値】WorldStateの読取りのみ 【完了条件】再ロード後の順位一致
- [ ] 【目的】仕様の厳格検証 【対象】`openspec/changes/threat-aware-garrison-priorities/` 【作業】OpenSpec strict実行 【テスト】Specification Design CI 【期待値】PASS 【完了条件】CI成功
- [ ] 【目的】安全な統合 【対象】PR/CI 【作業】型検査・Vitest・ビルド・Playwright・レビュー確認 【テスト】Check CI 【期待値】全成功 【完了条件】Squashマージ
