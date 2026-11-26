# Tasks
- [x] 【目的】最大規模負荷の再現 【対象】`tools/garrisonBenchmark.ts` 【作業】modern-eastasiaの実際の州グラフで256師団64地点の合成世界を構築 【テスト】Vitest 【期待値】上限どおりの件数、重複IDなし
- [x] 【目的】実経路探索を計数 【対象】`garrisonRouteCache.ts`・`garrisons.ts` 【作業】任意のカウンターにlookup・search・hit・nullを記録 【テスト】Vitest 【期待値】lookups=searches+hits、保存状態非変更
- [x] 【目的】性能の反復測定 【対象】`tools/bench.ts` 【作業】ウォームアップ・p50/p95・2分布・JSON出力を実装 【テスト】短時間反復 【期待値】決定論・非破壊・測定値が有限
- [x] 【目的】CI・利用手順 【対象】`.github/workflows/check.yml`・`docs/garrison-performance-benchmark.md` 【作業】最大規模スモーク実行とベンチマークの前提文書を追加 【テスト】Check CI 【期待値】実行が成功
- [ ] 【目的】OpenSpec strict検証 【対象】`garrison-stress-benchmark` 【作業】仕様をstrict検証 【テスト】Specification Design CI 【期待値】全成功
- [ ] 【目的】マージ条件 【対象】PR/CI 【作業】最新HEADの型検査・Vitest・ビルド・Playwright・ベンチマーク・レビュー・コンフリクト確認 【テスト】GitHub Actions 【期待値】全成功後Squashマージ
