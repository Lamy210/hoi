# Proposal: phase6-equipment-lines
対象: Phase 6A。状態: 設計提案（未実装）。依存: phase5-division-designer。

## Why
比率のみの2財生産では機材の世代・生産効率・工場配分・装備不足に応じた運用ができない。

## What Changes
- packの装備カタログと研究解禁、世代/互換グループ。
- 整数工場割当・優先度・生産効率・備蓄不足と補充/募集の配分。
- 生産・在庫台帳を一元化し、旧2財の直接書き込み経路を移行。

## Capabilities
- Modified: production-system, resource-system, research-system, military-system, economy-system, save-system, game-ui

## Impact
旧productionShareは移行時のみ使用。旧2財からトラック・支援装備・戦車へ段階的に拡張し、海空装備は対象外。資源投入と労働はphase6-industrial-economy。既存v4/v5/Phase5Bセーブを検証後に移行。
