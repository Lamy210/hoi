# Design: phase2-terrain-weather

## Decisions

- **D-031 天候の決定論**: `weatherOf(w, prov)`: 月（civilFromDays）→季節、`weekIdx = tick/7`、`rng = deriveStream(seed, 'weather', provId + ':' + weekIdx)` → 0.6晴/0.2雨/0.15雪（冬季のみ・緯度40度以北）/0.05嵐。実行時キャッシュ（週単位・runtime、セーブ対象外で再計算可能）。
- **D-032 冬季強化**: 緯度≥40かつ月が12/1/2のとき雪の攻撃係数0.85→0.75・移動0.75→0.65。
- **前面幅**: plains 8→10（GDD準拠）。バランス影響はシナリオテストで確認。

## Migration Plan

weather.ts → combat/movement統合 → snapshot/trace/UI → テスト。
