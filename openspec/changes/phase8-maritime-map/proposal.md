# Proposal: phase8-maritime-map
対象 Phase 8A。未実装。依存 Phase7の地図ID・データ品質契約（東アジア先行パックでも可）。

## Why
陸州の隣接グラフのみでは海域・港湾・輸送路を表せず、海峡と陸路の意味も混同する。

## What Changes
- 海域・港湾・海上隣接・海峡通航条件の定義と検証。
- 陸路・海峡横断・港湾航路・海域の型分離。
- 海域選択・港湾表示・地図モード・データ来歴。

## Capabilities
- Added: maritime-map
- Modified: world-map, military-system, scenario-system

## Impact
既存陸域IDを維持。海上補給と艦隊は後続Change。海域未収録の旧パックは陸軍モードを明示して維持。海域ポリゴンはゲーム用区画であり領海や主権の法的表示ではない。