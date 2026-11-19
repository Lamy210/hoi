# Tasks（未実装）

- [ ] 1.1 目的: 財と産地。対象: scenario/types.ts, loader.ts。作業: 財/産業/産地の定義・検証。テスト: 未知ID/負値/例外。期待値: 不正拒否。完了条件: unit合格。
- [ ] 1.2 目的: 労働供給。対象: systems/population.ts, politics.ts, core/state.ts。作業: 軍民労働・予約一元化。テスト: 動員/復員/人口減。期待値: 二重計上なし。完了条件: property合格。
- [ ] 2.1 目的: 日次産業。対象: systems/production.ts。作業: 投入/労働割当・一括入庫。テスト: 鋼材不足/循環/競合。期待値: 稼働率上限・非負。完了条件: integration合格。
- [ ] 2.2 目的: 建設。対象: systems/construction.ts。作業: 費用・資材・労働・完成能力。テスト: 資材不足/占領。期待値: 完成前割当なし。完了条件: integration合格。
- [ ] 2.3 目的: 貿易。対象: systems/economy.ts, diplomacy/treaties.ts。作業: 実在庫/支払/容量に制約。テスト: 支払不能/条約/戦争。期待値: 保存則。完了条件: property合格。
- [ ] 2.4 目的: 経済波及。対象: systems/economy.ts, population.ts, score.ts。作業: 消費・雇用・GDP・生活水準。テスト: 民需不足。期待値: トレース可能。完了条件: 50年複数seed。
- [ ] 3.1 目的: 保存移行。対象: save/serialize.ts, core/hash.ts。作業: 旧財→ID・資産検証。テスト: 旧実ファイル/往復/破損。期待値: 在庫・貨幣不変。完了条件: 回帰合格。
- [ ] 3.2 目的: 操作UI。対象: engine/ui.ts, ui/panels.tsx, i18n.ts。作業: 資源/産業/貿易/不足表示。テスト: 通常操作。期待値: 供給不足を診断可能。完了条件: Playwright合格。
- [ ] 4.1 目的: 性能と公開。対象: docs/13, check.yml。作業: Tier S/M/世界候補実測、strict/CI。テスト: 長期/Pages。期待値: 実測記録・全合格。完了条件: 最新HEADと公開確認。
