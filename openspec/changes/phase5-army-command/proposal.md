# Proposal: phase5-army-command
対象 Phase 5C。未実装。依存 phase5-division-designer。海軍機能に先行可能。

## Why
既存moveUnitsとFrontでは一時的な複数移動と単一戦線の割当しか管理できず、編成・指揮・作戦の永続化が不足する。

## What Changes
- 軍団・軍集団、複数選択、編入・解除・一括移動。
- 戦線、防衛線、攻勢計画、集結、撤退線の描画と師団割当。
- 指揮官階層、明示命令優先、停止/再開、作戦状況表示。

## Capabilities
- Modified: military-system, game-ui, ai-system, save-system

## Impact
既存Front/Commanderを移行。旧moveUnitsを互換入口に残し、同じ検証を使用。海上輸送は別Change、陸軍だけで海越え不可。