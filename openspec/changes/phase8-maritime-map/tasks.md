# Tasks（未実装）
- [ ] 1.1 目的: 海域カタログ。対象: scenario/types.ts, loader.ts。作業: SeaZone/Port/NavEdge/Gate、参照・checksum。テスト: M01/M02。期待値: 不正拒否。完了条件: unit合格。
- [ ] 1.2 目的: edge分類。対象: map/adjacency.ts, movement.ts。作業: 型分離・旧互換。テスト: M03/M04。期待値: 海越え拒否。完了条件: integration合格。
- [ ] 2.1 目的: 海域パック。対象: public/packs, tools/pipeline（復旧後）。作業: 架空fixture/東アジア区画・provenance。テスト: M05。期待値: 参照/LOD一致。完了条件: 検証と来歴確認。
- [ ] 2.2 目的: 地図表示。対象: maprender, GameScreen.tsx。作業: 海・港の型付き選択、凡例。テスト: M06/M07。期待値: DPR2・LODで一致。完了条件: E2E合格。
- [ ] 3.1 目的: 保存/公開。対象: save/serialize.ts, CI, docs/13。作業: pack移行ゲート・性能。テスト: M08/M09。期待値: 旧版維持、全回帰。完了条件: CIと公開確認。
