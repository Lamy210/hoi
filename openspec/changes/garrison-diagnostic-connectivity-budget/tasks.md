# Tasks
- [x] 【目的】通行権判定の共有 【対象】`src/engine/military/garrisonRouteCache.ts` 【作業】連結性の純粋な事前判定を抽出し駐屯計画からも再利用 【テスト】既存の到達可能性テスト 【期待値】到達可能性の偽陰性がない
- [x] 【目的】診断A*予算の節約 【対象】`garrisonRouteDiagnostics.ts` 【作業】未到達を連結性で判定し実A*呼出数だけをカウント 【テスト】診断Vitest 【期待値】離島ではpathChecksを増やさない
- [x] 【目的】同一診断内の重複経路抑制 【対象】`garrisonRouteDiagnostics.ts` 【作業】出発地点・到着地点ごとに実A*結果を一時キャッシュ 【テスト】既存の合法経路・予算上限のテスト 【期待値】読み取り専用を維持
- [x] 【目的】予算0と予算1の境界条件 【対象】`tests/integration/garrison-route-diagnostics.test.ts` 【作業】既存未確認の意味と接続性判定の予算節約を検証 【テスト】Vitest 【期待値】0で未確認、1で本土経路と離島の不通を区別
- [ ] 【目的】設計仕様の厳密検証 【対象】`openspec/changes/garrison-diagnostic-connectivity-budget` 【作業】OpenSpec strict 【テスト】Specification Design CI 【期待値】SUCCESS
- [ ] 【目的】統合品質とマージ 【対象】PR/CI 【作業】TypeScript、Vitest、build、256師団64地点benchmark、Playwright、最新HEADレビュー・コンフリクト 【テスト】Check CI 【期待値】全成功した場合のみSquashマージ
