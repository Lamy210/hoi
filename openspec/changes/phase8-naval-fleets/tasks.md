# Tasks（未実装）
- [ ] 1.1 目的: 艦艇定義。対象: scenario/types.ts, naval/models.ts（新規）。作業: 艦種/研究/費用/能力検証。テスト: N01。期待値: 未知参照拒否。完了条件: unit合格。
- [ ] 1.2 目的: 指揮。対象: core/state.ts, naval/fleets.ts（新規）, commands.ts。作業: 艦隊/部隊/所属/排他。テスト: N02/N03。期待値: 所属重複なし。完了条件: integration合格。
- [ ] 2.1 目的: 造船。対象: systems/production.ts, naval/construction.ts（新規）。作業: 能力/投入/乗員/建造。テスト: N04/N05。期待値: 二重消費なし。完了条件: integration合格。
- [ ] 2.2 目的: 修理退役。対象: naval/repair.ts（新規）, population.ts。作業: 能力消費・返却。テスト: N06。期待値: 資源・乗員保存。完了条件: property合格。
- [ ] 3.1 目的: 海上任務。対象: naval/movement.ts（新規）, maritime-map。作業: 状態遷移・海域権利。テスト: N07/N08。期待値: 位置一意。完了条件: integration合格。
- [ ] 3.2 目的: 海戦。対象: naval/combat.ts（新規）。作業: 架空fixtureで係数/閾値確定、決定論/損耗/停戦。テスト: N09/N10。期待値: 有限・非負。完了条件: 係数表レビューと回帰。
- [ ] 3.3 目的: 指標とAI。対象: naval/control.ts, ai/ai.ts。作業: 制海・unknown・任務選択。テスト: N11/N12。期待値: 同一制約。完了条件: integration合格。
- [ ] 4.1 目的: UI。対象: engine/ui.ts, ui/panels.tsx, GameScreen.tsx。作業: 艦隊/造船/海域/戦闘画面。テスト: N13。期待値: 日英通常操作。完了条件: Playwright合格。
- [ ] 4.2 目的: 保存・性能。対象: serialize.ts, hash.ts, docs/13, CI。作業: 状態/移行/長期。テスト: N14/N15。期待値: 往復一致、非負。完了条件: CI・公開確認。
