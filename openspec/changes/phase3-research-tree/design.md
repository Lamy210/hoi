# Design: phase3-research-tree

## Decisions

- **D-042 techs.json スキーマ**: `{id, cat, req: string[], days: number, mods: Record<string, number>}`。検証: id一意・前提存在・循環検出（DFS）・modsキーは既知集合（factoryOutput/orgRegen/supplyRadius/researchRate）。
- **D-043 研究力**: `RP/日 = (GDP/100000＋milFactories×0.02)×(0.5＋識字率×0.5)×(0.6＋安定度×0.4)`。教育配分スライダー（予算パネル）で ×(0.5〜1.5)。完了日は進捗/進行速度から決定論計算。
- **D-044 効果参照**: `techMods(c,'factoryOutput')` 等を production/politics/logistics が参照。traceに「技術」行を追加。
