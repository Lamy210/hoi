# Proposal: phase8-amphibious-transport
対象 Phase 8C。未実装。依存 phase5-army-command / phase8-maritime-map / phase8-naval-fleets / phase6-industrial-economy。

## Why
島嶼・海を隔てた国家で陸軍の通常移動を拡張するには、海上輸送と上陸を陸軍・海軍・兵站の共通状態で管理する必要がある。

## What Changes
- 港間輸送と強襲上陸のゲーム内作戦、師団・輸送船の割当。
- 準備、乗船、海上移動、到着/上陸戦闘、帰還、中止。
- 輸送容量、海上補給、港湾損失、貿易と輸送の競合。

## Capabilities
- Added: maritime-transport
- Modified: combat-system, logistics-system, game-ui, save-system

## Impact
陸軍通常移動は海越え禁止のまま。抽象ゲームモデルのみ。実際の上陸作戦・兵站の戦術モデルや実在の戦力評価は対象外。航空戦力は後続。