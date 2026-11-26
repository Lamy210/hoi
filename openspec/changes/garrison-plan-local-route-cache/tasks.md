# Tasks
- [x] 【目的】重複探索防止 【対象ファイル】`src/engine/military/garrisonRouteCache.ts` 【作業内容】州→目標のローカル経路Map、到達不能nullの再利用、配列の防御コピーを実装 【テスト】統合Vitest 【期待値】同一経路の実探索1回 【完了条件】WorldState非変更
- [x] 【目的】候補選定との共有 【対象ファイル】`src/engine/military/garrisons.ts` 【作業内容】計画開始時にlookupを作り全候補で再利用 【テスト】スタック師団を用いた統合Vitest 【期待値】同一出発地点の検索を重複実行しない 【完了条件】選択地点の順序が不変
- [x] 【目的】割当最適化との共有 【対象ファイル】`src/engine/military/garrisonBatchOptimization.ts` 【作業内容】同一lookupを受け取り未選択の代替割当の経路でも再利用 【テスト】3師団2港の実シナリオ 【期待値】原結果と同一で検索回数減 【完了条件】予想移動日数は師団ごとに計算
- [x] 【目的】キャッシュの寿命・互換性 【対象ファイル】`tests/integration/garrison-route-cache.test.ts` 【作業内容】別の計画で再探索、nullキャッシュ、経路コピー、セーブ復元後7tickを検証 【テスト】Vitest 【期待値】決定論と保存形式不変 【完了条件】現在の状態のみを使用
- [ ] 【目的】厳格仕様検証 【対象ファイル】`openspec/changes/garrison-plan-local-route-cache/` 【作業内容】OpenSpec strictを実行 【テスト】Specification Design CI 【期待値】成功 【完了条件】最新HEAD成功
- [ ] 【目的】統合品質とマージ判断 【対象ファイル】PR/Check CI 【作業内容】型検査・Vitest・ビルド・Playwright・差分レビュー・競合確認 【テスト】Check CI 【期待値】全て成功 【完了条件】Squashマージ
