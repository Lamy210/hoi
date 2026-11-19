# Proposal: phase3-research-tree

## Why

技術研究は5軸スコアの「技術水準」軸そのものであり、docs/03 §7のツリー（シナリオデータ・前提グラフ・効果）が未実装。経済余力を技術に変換する非軍事経路の核。

## What Changes

- **技術ツリー（シナリオデータ）**: パック `techs.json`（id・カテゴリ・前提・研究日数基準・効果modifiers）。現代パックに8技術（工業×3・医療×2・農業×1・通信×2）。ロード時に循環・未知キー検証（baselineどおり）。
- **研究進行**: 研究力RP/日 = `(GDP×0.000001＋大学効果)×識字率×(0.6＋安定度×0.4)×教育配分`。並行枠2（baselineどおり）。進行は決定論。
- **技術効果**: modifiers を一元マップ（`techMods(c, key)`）で公開し、生産係数・org回復・補給半径等が参照。
- UI: 研究パネル（ツリー状態・進行度・研究力トレース）。セーブv3（進行中/完了技術）。

## Impact

- Affected specs: `research-system`（データ駆動の技術ツリー・研究進行の計算・技術効果の適用）
- Affected code: scenario/loader.ts（techs.json検証）・systems/research.ts（新規）・production/politics参照・core/state.ts（v3）・UI・i18n
