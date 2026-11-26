# Tasks
- [x] 【目的】偽の移動候補を除外 【対象ファイル】`garrisonRouteDiagnostics.ts` 【作業内容】到着予定を現地守備人数から除外し候補選出に使用 【テスト】統合Vitest 【期待値】増援未到着なら最後の守備師団を候補にしない 【完了条件】経路探索上限と読み取り専用を維持
- [x] 【目的】未防衛理由の誤表示を修正 【対象ファイル】`garrisonCoverage.ts` 【作業内容】到着予定師団を出発可能判定に算入しない 【テスト】単体Vitest 【期待値】最後の守備隊しかいない場合は移動可能師団なし 【完了条件】増援の移動中表示は保持
- [x] 【目的】実際のプランナーと診断の整合 【対象ファイル】`garrison-route-diagnostics.test.ts` 【作業内容】増援到着前後の診断結果と実配置計画を比較 【テスト】Vitest 【期待値】両者の選出条件が一致 【完了条件】WorldState非変更をhashで検証
- [x] 【目的】スナップショットの退行防止 【対象ファイル】`garrison-coverage.test.ts` 【作業内容】到着予定と現地守備隊の重複カバレッジ境界を検証 【テスト】Vitest 【期待値】移動中・現地到着後でギャップ理由が変化 【完了条件】入力不変
- [ ] 【目的】仕様の厳格検証 【対象ファイル】`openspec/changes/garrison-readonly-guard-consistency/` 【作業内容】strict検証 【テスト】Specification Design CI 【期待値】SUCCESS 【完了条件】最新HEAD成功
- [ ] 【目的】統合品質とマージ 【対象ファイル】PR/CI 【作業内容】型検査・Vitest・ビルド・Playwright・差分レビューと最新HEAD照合 【テスト】Check CI 【期待値】全成功 【完了条件】レビュー問題なしでSquashマージ
