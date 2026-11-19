# Proposal: division-training-production

## Why
固定編成の即時作成から、備蓄、生産配分、編成、訓練、配備、補充を連動させる。

## What Changes
- 初期3テンプレート（軽歩兵、標準歩兵、重砲兵）、訓練予約、配備、中止時の返却。
- 既存2財の生産配分と実出力・備蓄を専用画面に表示。
- 戦闘力・損耗閾値を師団規模と編成に対応。
- v5セーブに訓練を保持し、v4の読み込みを維持。

## Capabilities
- Modified: military-system, production-system, save-system, game-ui

## Impact
既存AIと旧createUnit APIは互換のため維持する。通常UIは訓練経由。新装備・自由大隊編成・生産効率・資源投入・AIの訓練移行は後続。数値は仮のゲーム調整値で現実の軍事編成ではない。
