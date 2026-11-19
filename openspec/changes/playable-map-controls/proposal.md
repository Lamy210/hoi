# Proposal: playable-map-controls

## Why
Phase 4公開版の地図が上下反転し、拡大/移動が描画に反映されない。また停止中の命令は未実行のままで、研究と戦争画面への導線が不足する。

## What Changes
- 北向きWeb Mercator、カーソル中心ズーム、ドラッグ移動、拡大/縮小/全体表示。
- 変換後の描画・Picking・LODを同一カメラに同期。
- 研究・戦争画面の直接導線、未実行命令の表示、明示的な1日進行。
- 速度を経過時間で制御。公開用ビルドの実操作回帰検証。

## Capabilities
- Modified: world-map, game-ui

## Impact
UI、Workerの命令処理通知、Playwright、Vitest、CI。決定論的tick境界・セーブ形式・パックを維持する。世界全域の地図・タッチのピンチズームは後続。
