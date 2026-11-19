# Tasks（未実装）
- [ ] 1.1 目的: 輸送モデル。対象: core/state.ts, naval/transport.ts（新規）。作業: state/location union・拘束/容量。テスト: T01/T02。期待値: 二重拘束なし。完了条件: unit合格。
- [ ] 1.2 目的: 作戦コマンド。対象: commands.ts, naval/transport.ts。作業: 準備/実行/再検証/中止。テスト: T03/T04。期待値: 全件原子的。完了条件: integration合格。
- [ ] 2.1 目的: 海上進行。対象: naval/movement.ts, systems/index.ts。作業: scheduler/帰還/権利変化。テスト: T05/T06。期待値: 瞬間移動なし。完了条件: integration合格。
- [ ] 2.2 目的: 上陸戦闘。対象: combat.ts, transport.ts。作業: 状態引渡し・ゲーム係数のfixture確定。テスト: T07/T08。期待値: 占領と損失の一意性。完了条件: 回帰・係数表レビュー。
- [ ] 2.3 目的: 海上補給。対象: logistics.ts, economy.ts, inventory。作業: 容量競合・配分・配送。テスト: T09/T10。期待値: 非負/二重消費なし。完了条件: property合格。
- [ ] 3.1 目的: AI。対象: ai/ai.ts, systems/fronts.ts。作業: 拘束と合法作戦の統一。テスト: T11。期待値: 通常海越えなし。完了条件: integration合格。
- [ ] 3.2 目的: UI。対象: engine/ui.ts, GameScreen.tsx, panels.tsx, maprender。作業: 作戦描画・準備・操作。テスト: T12。期待値: 通常UIで完結。完了条件: E2E合格。
- [ ] 4.1 目的: セーブ。対象: serialize.ts, hash.ts。作業: union移行・拘束/イベント保持。テスト: T13/T14。期待値: 往復一致。完了条件: 実fixture合格。
- [ ] 4.2 目的: 長期・公開。対象: CI, docs/13。作業: T15・全回帰・性能。テスト: strict/50年×20seed。期待値: 非負・参照切れなし。完了条件: CI・公開確認。
