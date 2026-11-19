# Tasks（未実装）

- [ ] 1.1 目的: カタログ。対象: scenario/types.ts, loader.ts, resource store。作業: 財・装備ID・世代と解禁参照。テスト: 未知/重複/互換。期待値: 不正拒否。完了条件: unit合格。
- [ ] 1.2 目的: 在庫統合。対象: core/state.ts, inventory（新規）。作業: 自由/予約/部隊移動台帳。テスト: 保存則。期待値: 非負・二重消費なし。完了条件: property合格。
- [ ] 1.3 目的: 工場配分。対象: systems/production.ts, commands.ts。作業: 整数割当/優先度/効率。テスト: 工場減/0/切替。期待値: 割当上限、決定論。完了条件: unit合格。
- [ ] 2.1 目的: 装備配分。対象: systems/training.ts, combat.ts。作業: queued予約と補充を統合。テスト: 競合/取消。期待値: 優先度・保存則。完了条件: integration合格。
- [ ] 2.2 目的: 市場接続。対象: systems/economy.ts, ai/ai.ts。作業: 旧直書き除去/輸出余剰/AI配分。テスト: 予約輸出不可。期待値: 台帳一致。完了条件: 長期検証。
- [ ] 3.1 目的: 保存移行。対象: save/serialize.ts, core/hash.ts。作業: 旧比率→整数割当/装備移行。テスト: v4/v5/Phase5B。期待値: 保有・予約不変。完了条件: 旧実ファイル回帰合格。
- [ ] 3.2 目的: UI。対象: ui/panels.tsx, engine/ui.ts, i18n.ts。作業: ライン・不足・優先度。テスト: 実UI切替/補充。期待値: コマンド反映。完了条件: Playwright合格。
- [ ] 4.1 目的: リリース。対象: check.yml, docs/13。作業: strict/全回帰/性能。テスト: CI/50年/Pages。期待値: 全合格。完了条件: 実測記録、実URL確認。
