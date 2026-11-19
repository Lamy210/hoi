# Design: phase2-fronts-logistics

## Context

baseline spec（military-system 戦線・logistics-system capacityFactor）をPhase 1の実装の上に完成させる。Phase 1ではAIが州単位で直接命令しており、戦線レイヤーが存在しない。

## Goals / Non-Goals

- Goals: 戦線オブジェクト・スタンス3種・攻勢計画・capacityFactor・割譲講和・併合・UI表示・セーブv2
- Non-Goals: 軍団/軍集団の集約（Phase 3）、講和会議UI（Phase 4）、鉄道網（データがないためinfraで近似）

## Decisions

- **D-022 Frontモデル**: `Front {id, owner, enemy, stance: hold|attack|retreat, provinces: number[], targets: number[], cap: number}`。割当は `unit.frontId` で表現。戦線AI（systems/fronts.ts・週次）はプレイヤーの戦線とAI戦線に同一ロジックを適用し、命令はコマンド経由（INV-3維持）。`unit.path.length > 0`（移動中/明示命令）の師団には触れない＝明示命令優先。
- **D-023 capacityFactor**: ハブ = 首都＋terrain=urban の州（controllerが供給国）。容量 `6 + 3×infra`。国ごとに「師団を最寄りハブへ貪欲割当」し、ハブの demand > capacity なら超過分の師団は supplyEff ×0.5。距離減衰とは独立に乗算。
- **D-024 割譲講和**: `proposePeace {warId, type: 'white'|'demand'}`。demand受諾条件: 相手スコア < -30 または戦争480日超。受諾時 `owner = controller` へ移転（解放ではなく確定）。併合は日次チェック（全領土支配＋無兵力）で war終結＝勝利的講和。
- **セーブv2**: fronts（固定長列＋可変provinces配列）・wars拡張・annexation状態を追加。v1セーブは明確なエラーメッセージで拒否（開発期）。`SAVE_SCHEMA_VERSION = 2`。

## Risks / Trade-offs

- 戦線AIがプレイヤー師団を動かすため、意図しない再配置の恐れ → スタンス「hold（防衛）」は攻撃しない・移動は前線州の穴埋めのみに限定し、トレースで判断根拠を公開。
- capacityFactor で補給が厳しくなりAI攻勢が停滞する可能性 → 容量を6+3×infraと余裕を持たせ、実測（シナリオテスト）で調整。

## Migration Plan

1. state v2ストア追加 → save v2 → 既存テストをv2で通す → fronts AI/システム追加 → UI。
