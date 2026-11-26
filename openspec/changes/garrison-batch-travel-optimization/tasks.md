# Tasks
- [x] 【目的】移動コストの整合 【対象】`garrisonBatchOptimization.ts` 【作業】師団固有の移動係数と現在の区間条件で予想移動日数を積算 【テスト】Vitest 【期待値】州数ではなく実移動時間に近い指標
- [x] 【目的】複数駐屯地点の移動時間短縮 【対象】`planGarrisonMoves` 【作業】既に安全と判定された最大4件の命令に対し厳密割当を探索 【テスト】2師団・3師団の既知ケース 【期待値】元より長い計画は採用しない
- [x] 【目的】安全性の維持 【対象】`garrisons.ts`・最適化関数 【作業】守備隊を減らさず、同じ師団集合と対象集合だけを交換 【テスト】手動固定・最後の守備隊・予算上限・ハッシュ不変 【期待値】不正な移動を作らない
- [x] 【目的】再現性 【対象】`garrison-batch-optimization.test.ts` 【作業】セーブ・復元後に同じ移動計画と14tickのハッシュ一致を検証 【テスト】Vitest 【期待値】決定論保持
- [ ] 【目的】仕様品質 【対象】`openspec/changes/garrison-batch-travel-optimization/` 【作業】strict検証 【テスト】Specification Design CI 【期待値】SUCCESS
- [ ] 【目的】統合品質 【対象】PR/Check CI 【作業】型検査、テスト、ビルド、Playwright、差分を確認 【期待値】最新HEAD成功後にSquashマージ
