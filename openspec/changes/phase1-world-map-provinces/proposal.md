# Proposal

## Why
「地図が主役」のピラーを満たす最初の実装が必要。プレイヤーが視覚的に世界を把握しプロヴィンスを選択できる状態がないと、以降の軍事・経済機能を検証できない。MapLibreのインラインGeoJSON＋feature-stateによるオフライン描画が公式機能として確認済み（docs/09）であり、ティアS（~120州）でMVPを成立させる。

## What Changes
- `tools/pipeline/` に最小ジオメトリパイプライン（GeoJSON → 簡略化 → パック形式）の雛形を作り、現代東アジアの仮ジオメトリを生成する
- `src/engine/map/` にProvinceStore（SoA）の構築・隣接CSR・パック読込を実装する
- `src/maprender/` にMapRenderer抽象とMapLibre実装（政治・地形モード、ホバー/選択、LOD 2段階）を作る
- Worker起動の骨格（コマンド往復・スナップショット配信）をこのChangeに先行して整備する
- UIは最小限のテスト用ページ（Change 7で本実装）

## Capabilities
### Modified Capabilities
- `world-map`: MapLibre実装・Picking・LOD 2段階の機能要件を追加
- `province-system`: ストア構築・隣接構築・初期値設定の機能要件を追加

## Impact
- **対象Phase**: 1 の 2/7
- **後続依存**: country/scenario（Change 3）はProvinceStoreを、military（Change 4）は隣接グラフと移動コストを利用する
- **リスク**: R-20（MapLibreの大量ポリゴン限界）はティアSなら余裕があるが、抽象層（D-004）で20k州時の切替余地を確保する
