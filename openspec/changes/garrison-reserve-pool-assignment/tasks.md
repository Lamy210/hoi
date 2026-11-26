# Tasks
- [x] 【目的】安全な予備師団の抽出 【対象】`selectGarrisonReserveCandidates` 【作業】未使用の配属師団を検査し、防衛対象にいる守備隊・手動固定・移動中・包囲中・前線配属中・戦闘中・撃破済みを除外 【テスト】Vitest 【期待値】守備中師団が予備と誤認されない
- [x] 【目的】候補数の上限 【対象】`garrisonBatchOptimization.ts` 【作業】近似距離と師団IDで安定ソートし最大8師団を抽出 【テスト】同距離の上限ケース 【期待値】決定論的な選択
- [x] 【目的】予備師団を含む割当 【対象】`optimizeGarrisonBatch` 【作業】最大4選択済み師団＋8予備師団から同じ目標を最短総移動日数で割り当て 【テスト】釜山・仁川の2港ケース 【期待値】改善する場合のみ余剰師団を採用
- [x] 【目的】既存安全性 【対象】`planGarrisonMoves` 【作業】初回の対象・守備隊の決定を維持し後段の選択肢だけ増やす 【テスト】既存のVitestと14tick再現性 【期待値】週次4命令超過なし
- [ ] 【目的】OpenSpec契約の確認 【対象】`garrison-reserve-pool-assignment` 【作業】strict検証 【テスト】Specification Design CI 【期待値】SUCCESS
- [ ] 【目的】品質確認と統合 【対象】PR/Check CI 【作業】型検査・Vitest・ビルド・Playwrightを実行 【期待値】全成功後にレビュー、Squashマージ
