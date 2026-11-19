# Design

## Context
ティアSは約120プロヴィンス（東アジア5国）。NE 10m admin-1をクリップし簡略化したジオメトリをパックに同梱する。描画はMapLibre 6.x（BSD-3）、オフライン（inline GeoJSON・タイルサーバなし）。

## Goals / Non-Goals
- Goals: 120州の60fps描画・ホバー/選択・政治/地形2モード・LOD 2段階
- Non-Goals: 20k州規模の性能（ティアL、Phase 4で実測）、ラベル衝突の最適化、海洋描画の高度化

## Decisions
- **D-004維持**: MapRendererインターフェースを先に定義し、MapLibreは最初の実装とする。pickはfeature-state（mousemove on layer）で実装。
- **ジオメトリ形式**: パックに簡略化GeoJSON（2段階）＋将来の三角分割バイナリ用スロット。LOD切替はズーム閾値（パック定義）でsource/layerを切替。
- **Worker骨格**: エンジンをWorker内で起動し、コマンドはpostMessage、スナップショットは間引き送信（rAF間引き）。SABは不使用（D-006）。
- **仮データ**: パイプラインが動くまでの間、手作りの簡易ポリゴンをfixturesとして使用（PoC-2のダブルトラック）。

## Risks / Trade-offs
- MapLibreのGeoJSON上限は公式保証なし → ティアSでPoC-2を実測し、docs/13に記録。
- feature-stateのhoverは毎mousemove更新でGC負荷が上がる可能性 → 更新間引き（スロットル）で対処。
