# Proposal: phase5-division-designer
対象: Phase 5B。状態: 設計提案（未実装）。依存: division-training-production (#11) のCI・マージ、保存互換検証。

## Why
固定3編成だけでは戦場や装備不足に応じた編成の選択ができない。戦力・人的資源・装備・補給のトレードオフを同一モデルで扱う。

## What Changes
- 大隊・支援中隊カタログと国家所有の変更不可なテンプレート改訂版。
- 既存師団の編成変更、募集優先度、訓練・配備の明示状態、AIの同一制約。
- 編成の算出値と戦闘/補給に同じ計算を使用する。

## Capabilities
- Modified: military-system, combat-system, logistics-system, ai-system, save-system, game-ui

## Impact
- Workerコマンド・ユニット・訓練・保存・AI・UIを変更。
- 装備は既存2財から開始。追加装備はphase6-equipment-lines、資源市場はphase6-industrial-economy。
- 既存v4/v5の復元が必須。初期数値はゲーム内の仮値で、実軍の数値ではない。
