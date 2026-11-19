# Proposal: phase8-naval-fleets
対象 Phase 8B。未実装。依存 phase6-equipment-lines / phase6-industrial-economy / phase8-maritime-map。

## Why
海軍を陸軍の師団と同じオブジェクトにすると、海域移動・造船・修理・艦隊任務・海戦・輸送の責務が混在する。

## What Changes
- 艦種とモデル、造船所配分、建造・修理・退役。
- 艦隊・任務部隊、海域移動、哨戒・護衛・制海権。
- 抽象的な海戦の決定論解決、輸送への戦闘結果通知。

## Capabilities
- Added: naval-system
- Modified: production-system, economy-system, research-system, save-system, ai-system, game-ui

## Impact
海軍は独立状態、装備/労働/貨幣は共通台帳。海軍数値はゲーム調整値、実艦性能や現実の軍事運用は再現しない。航空支援は後続Phase8D。