# Proposal: phase6-industrial-economy
対象: Phase 6B。状態: 設計提案（未実装）。依存: phase6-equipment-lines。

## Why
軍需生産の拡張を民間経済・資源・労働と結びつけ、軍拡の機会費用を表現する。

## What Changes
- シナリオ財・産地・産業・投入産出・労働力・建設能力の一元管理。
- 軍需と民需の競合、国際貿易と価格、生活水準・財政への波及。
- 流量/残高の台帳と日次順序、長期シミュレーション検証。

## Capabilities
- Modified: resource-system, production-system, economy-system, population-system, construction-system, game-ui, save-system

## Impact
旧2財と食料/消費財固定配列を共通財IDに対応させる。世界全域データや実世界の経済予測、戦略物資の具体的実軍需値は対象外。既存セーブ移行と旧版の再現性検証が必須。
