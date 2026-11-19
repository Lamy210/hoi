# Proposal: phase2-terrain-weather

## Why

GDD §4.3の戦闘解決は「地形 × 天候 × 補給 × 指揮官」を要求するが、Phase 1は地形・補給のみ。天候/季節は戦略の季節性（冬季攻勢の不利など）を生む基本要素。

## What Changes

- **季節・天候**: 月と緯度帯から季節（冬/春/夏/秋）を決定し、週ごとの天候（晴/雨/雪/嵐）を `deriveStream(seed,'weather',provId+week)` で決定論的に決める。
- **効果**: 雪=移動×0.75・攻撃×0.85、雨=移動×0.85・攻撃×0.92、嵐=移動×0.7・攻撃×0.8、冬季は緯度40度以北で効果が強化。org回復に×0.8（悪天候）。
- **前面幅のGDD準拠**: plains を8→10へ（GDD §4.3: plains 10/hills 6/mountains 4/urban 5）。
- UI: 州パネルに季節・天候表示、トレースに天候係数。i18n。

## Impact

- Affected specs: `combat-system`（天候係数・前面幅）
- Affected code: systems/weather.ts（新規）、combat.ts、movement.ts、ui.ts、UI、i18n
