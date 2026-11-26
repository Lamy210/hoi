# Tasks

- [x] 【目的】実際の合法陸路を調べる 【対象】`src/engine/military/garrisonRouteDiagnostics.ts` 【作業】作戦単位の読み取り専用経路探索と状態分類を追加 【テスト】有効な陸路・孤立島・状態不良 【期待値】推測でなく探索結果からのみ陸路判定 【完了条件】検索上限付き純粋診断
- [x] 【目的】UI更新ごとの経路探索を回避 【対象】`src/engine/worker.ts`・`src/ui/engineClient.ts` 【作業】所有権検証付きオンデマンドRPCを追加 【テスト】不正・他国作戦IDの拒否 【期待値】通常スナップショットは変わらない 【完了条件】明示操作時だけRPC呼び出し
- [x] 【目的】未防衛原因の確認 【対象】`src/ui/ArmyCommandDock.tsx` 【作業】作戦単位の診断ボタンと結果を表示 【テスト】Playwrightで診断結果を確認 【期待値】判定不能は未確認と表示 【完了条件】日本語/英語で画面確認
- [x] 【目的】既存コマンドの保護 【対象】`tests/integration/garrison-route-diagnostics.test.ts` 【作業】WorldStateハッシュ、非変更性・上限・状態分類の回帰 【テスト】Vitest 【期待値】診断前後で命令・戦線・経路に変化なし 【完了条件】テスト追加
- [ ] 【目的】仕様検証 【対象】`openspec/changes/on-demand-garrison-route-diagnostics/` 【作業】strict OpenSpecをCIで検証 【テスト】Specification Design CI 【期待値】厳格検証成功 【完了条件】CI成功
- [ ] 【目的】安全な統合 【対象】PR、CI 【作業】最新HEADの型検査・Vitest・ビルド・E2Eとレビューを確認 【テスト】Check CI 【期待値】全項目成功 【完了条件】Squashマージ
