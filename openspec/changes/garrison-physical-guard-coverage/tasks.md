# Tasks
- [x] 【目的】現地守備を正確に扱う 【対象ファイル】`src/engine/military/garrisons.ts` 【作業内容】予定カバレッジと現地守備人数を分離 【テスト】Vitest 【期待値】移動中師団は現地守備人数に入らない 【完了条件】予定経路と現地人数を個別に管理
- [x] 【目的】実行時のすり抜けを防ぐ 【対象ファイル】`src/engine/military/garrisons.ts` 【作業内容】最後の守備隊判定を現地師団だけで行う 【テスト】AI移動命令の統合テスト 【期待値】到着前は拒否 【完了条件】予定増援を理由に現地守備が空にならない
- [x] 【目的】後からの配置を妨げない 【対象ファイル】`tests/integration/area-garrison-defense.test.ts` 【作業内容】増援の到着前と到着後を比較 【テスト】Vitest 【期待値】到着後の合法移動は許可 【完了条件】同じシナリオで両状態を検証
- [x] 【目的】仕様と実装の整合 【対象ファイル】`openspec/changes/garrison-command-last-guard-validation/` 【作業内容】到着予定の扱いを修正 【テスト】OpenSpec strict 【期待値】現行実装と一致 【完了条件】矛盾した説明がない
- [ ] 【目的】統合検証 【対象ファイル】GitHub Actions/PR 【作業内容】型検査・Vitest・ビルド・Playwright・strict検証、差分レビューとマージ確認 【テスト】Check CI/Specification Design CI 【期待値】全成功 【完了条件】条件を満たした場合のみSquashマージ
