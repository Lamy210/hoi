# Tasks

- [x] 【目的】判定の一貫性 【対象】`src/ui/garrisonCoverage.ts` 【作業】駐屯対象の支配者と所属師団の位置・移動先から状態を投影 【テスト】Vitestで4状態・順序・不変性 【期待値】観測可能な情報だけを判定 【完了条件】入力を変更しない純粋関数を実装
- [x] 【目的】未防衛地点の発見 【対象】`src/ui/ArmyCommandDock.tsx` 【作業】作戦ごとのカバレッジ件数と各地点の状況・不足理由を表示 【テスト】Playwrightで2港1師団の未防衛表示 【期待値】軍団指揮画面で状態が識別できる 【完了条件】日本語/英語の両方で表示
- [x] 【目的】更新負荷の抑制 【対象】`src/ui/garrisonCoverage.ts` 【作業】師団を1回だけ走査して位置別に集計 【テスト】Vitestの重複・順序ケース 【期待値】地点数ごとに全師団走査しない 【完了条件】集計マップの利用
- [ ] 【目的】仕様合意 【対象】`openspec/changes/garrison-coverage-visibility/` 【作業】厳格検証と仕様レビュー 【テスト】Specification Design CI 【期待値】strict成功 【完了条件】CI成功
- [ ] 【目的】安全な統合 【対象】PRとCheck CI 【作業】差分・型検査・Vitest・ビルド・Playwrightの最終結果を確認 【テスト】最新HEADのCI 【期待値】すべて成功 【完了条件】成功後Squashマージ
