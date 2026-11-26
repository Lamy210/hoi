# Tasks
- [x] 【目的】陸路診断の説明力 【対象】`garrisonRouteDiagnostics.ts` 【作業】候補師団の見つかった合法経路へ共通予想日数計算を適用 【テスト】Vitest 【期待値】積算日数を再現
- [x] 【目的】表示の透明性 【対象】`ArmyCommandDock.tsx` 【作業】予想日数と最短・同時配置保証ではない注意を表示 【テスト】Playwright 【期待値】判断材料が読み取れる
- [x] 【目的】偽精度を防止 【対象】`garrison-route-diagnostics.test.ts` 【作業】陸路不通と探索未完了では日数を出さない 【テスト】Vitest 【期待値】観測していない推計を表示しない
- [ ] 【目的】仕様の確認 【対象】`openspec/changes/garrison-route-estimated-days/` 【作業】strict検証 【テスト】Specification Design CI 【期待値】成功
- [ ] 【目的】統合品質 【対象】PRとCheck CI 【作業】型検査・Vitest・ビルド・Playwright・未解決レビュー確認 【テスト】全CI 【期待値】成功後Squashマージ
