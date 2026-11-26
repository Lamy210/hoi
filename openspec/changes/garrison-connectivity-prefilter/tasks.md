# Tasks
- [x] 【目的】通過可否の単一責務 【対象】`movement.ts` 【作業】A*で使う自国/交戦/通行権/同盟の判定を共通化 【テスト】合法性比較 【期待値】原経路の結果を変更しない
- [x] 【目的】到達不能な経路探索の削減 【対象】`garrisonRouteCache.ts` 【作業】現行WorldStateに対して計画内連結成分を作り、不可能な州ペアをA*前に拒否 【テスト】離島・外国支配 【期待値】不可能な組合せで実A*ゼロ
- [x] 【目的】合法な経路を拒否しない 【対象】`tests/integration/garrison-route-cache.test.ts` 【作業】元のA*との複数経路比較、通過不能な始点、支配権復帰を検証 【テスト】Vitest 【期待値】偽陰性なし
- [x] 【目的】統計を正確に計算 【対象】`garrisonRouteCache.ts`・`garrisonBenchmark.ts`・テスト 【作業】事前除外件数と実A*件数を分ける 【テスト】探索件数・ベンチ 【期待値】要求=検索+ヒット+事前除外
- [x] 【目的】計測と文書の整合 【対象】`tools/bench.ts`・`docs/garrison-performance-benchmark.md` 【作業】CLIとJSONに事前除外を追加 【テスト】CIの最大規模スモーク 【期待値】合成シナリオの計測が成功
- [ ] 【目的】厳格仕様検証 【対象】`openspec/changes/garrison-connectivity-prefilter/` 【作業】strict検証 【テスト】Specification Design CI 【期待値】SUCCESS
- [ ] 【目的】マージの安全性 【対象】PR/Check CI 【作業】型検査・Vitest・ベンチ・build・Playwright・レビュー・最新HEAD照合 【テスト】全CI 【期待値】成功後Squashマージ
