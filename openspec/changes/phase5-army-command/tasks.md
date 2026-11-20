# Tasks（未実装）
- [ ] 1.1 目的: 指揮階層。対象: core/state.ts, military/armies.ts（新規）。作業: ID、所属、上限、逆引き。テスト: A01/A02。期待値: 重複所属なし。完了条件: unit合格。
- [ ] 1.2 目的: 編入・指揮官。対象: commands.ts, military/commanders.ts。作業: 原子的検証・役職排他。テスト: A03/A04。期待値: 部分変更なし。完了条件: integration合格。
- [ ] 2.1 目的: 一括移動・停止。対象: commands.ts, movement.ts。作業: 経路世代、append、hold。テスト: A05/A06。期待値: 進捗維持。完了条件: integration合格。
- [ ] 2.2 目的: 作戦。対象: systems/fronts.ts, military/fronts.ts。作業: 版・割当・和平・自動停止。テスト: A07/A08。期待値: 古い命令拒否。完了条件: integration合格。
- [ ] 3.1 目的: 地図選択。対象: ui/GameScreen.tsx, maprender。作業: 多選択、矩形、DPR/タッチ。テスト: A09。期待値: 選択/パン排他。完了条件: E2E合格。
- [ ] 3.2 目的: 軍団・作戦UI。対象: panels.tsx, engine/ui.ts, i18n.ts。作業: バー/矢印/実行停止。テスト: A10/A11。期待値: 通常操作。完了条件: E2E合格。
- [ ] 4.1 目的: 保存。対象: save/serialize.ts, core/hash.ts。作業: 旧Front移行・命令状態保存。テスト: A12。期待値: 往復一致。完了条件: 実fixture合格。
- [ ] 4.2 目的: 性能と公開。対象: docs/13, CI。作業: A13長期・性能・strict。テスト: 全回帰。期待値: 参照切れなし。完了条件: 最新HEADと公開確認。

- [ ] 0.1 目的: 軍団/軍集団と軍需・補給一覧の先行実装。対象: military/armies.ts, armySummary.ts, commands.ts, save/serialize.ts, engine/ui.ts, ArmyManagement.tsx, GameScreen.tsx。作業: 所属/容量/参照/集計、v7、旧v6検証、一覧検索と選択。テスト: A01〜A03/A12の階層部分、装備不足/補給内訳、通常UI。期待値: 重複所属・非所有・上限超過を拒否、集計・位置一致、旧版移行。完了条件: 最新CI成功、旧実ファイル検証と作戦機能は後続、既存タスクは未完了維持。

- [ ] 0.2 目的: 軍団選択と既存戦線を接続。対象: commands.ts, systems/fronts.ts, core/state.ts, save/serialize.ts, ui/panels.tsx, GameScreen.tsx。作業: 一括割当解除、停止・再開・手動hold、版付きfrontMove、攻勢目標、v8移行。テスト: A07/A08/A12の先行範囲と通常UI。期待値: 停止/旧版/講和/手動hold中の自動命令拒否。完了条件: CIと公開確認。完全な作戦管理は残す。

- [ ] 0.3 目的: 手動移動の停止・経路変更を先行実装。対象: systems/movement.ts, commands.ts, engine/ui.ts, GameScreen.tsx, panels.tsx。作業: 区間保持と全件検証、hold、次州・進捗表示。テスト: A06の先行範囲、A17〜A19。期待値: 進行区間の巻戻しなし、到着後停止、原子的拒否、v8継続。完了条件: CI合格・通常UI確認。append/戦闘中撤退は後続。
