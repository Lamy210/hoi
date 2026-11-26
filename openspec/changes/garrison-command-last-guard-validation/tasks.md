# Tasks
- [x] 【目的】実行境界での守備隊保護 【対象ファイル】`src/engine/military/garrisons.ts` 【作業内容】移動元の最後の駐屯守備隊を判定する純粋関数を追加 【テスト】複数守備隊・最後の守備隊 【期待値】作戦配属先への移動予定も既存計画と同じく評価 【完了条件】副作用なしで判定
- [x] 【目的】適用時の競合防止 【対象ファイル】`src/engine/commands.ts` 【作業内容】`garrisonMove`検証へ判定を追加 【テスト】AI発行の直接命令 【期待値】守備隊ゼロを生む命令を拒否 【完了条件】検証エラーが返り師団移動なし
- [x] 【目的】退行検出 【対象ファイル】`tests/integration/area-garrison-defense.test.ts` 【作業内容】最後の1師団と連続する2命令の実行時検証を追加 【テスト】Vitest 【期待値】修正前の実装では失敗する 【完了条件】命令拒否理由と経路非変更を検証
- [ ] 【目的】設計契約の厳格検証 【対象ファイル】`openspec/changes/garrison-command-last-guard-validation/` 【作業内容】OpenSpec strict検証 【テスト】Specification Design CI 【期待値】成功 【完了条件】全検証成功
- [ ] 【目的】統合品質 【対象ファイル】GitHub PRとCI 【作業内容】型検査・Vitest・ビルド・Playwright・コード差分とレビュー確認 【テスト】Check CI 【期待値】全項目成功 【完了条件】条件を満たした場合にSquashマージ
