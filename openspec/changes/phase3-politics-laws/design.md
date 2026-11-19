# Design: phase3-politics-laws

## Decisions

- **D-039 法律データ**: エンジン内蔵の2slot×3選択肢（徴兵: volunteer/conscription/total → 動員率0.01/0.02/0.05・安定度0/−0.05/−0.15、経済: planned/mixed/free → 産出係数0.9/1.0/1.1・生活水準±0.05）。パック拡張はPhase 4。
- **D-040 支持率**: `clamp(0.5＋(living−0.5)×0.6−taxRate×0.4−(atWar?0.1:0)＋事件ボーナス, 0, 1)`。contributorsはトレースAPIで公開。
- **D-041 安定度の波及**: org回復×(0.7＋安定度×0.3)、研究力×(0.6＋安定度×0.4)。安定度<0.2でイベント機構の「動揺」トリガーの受け皿（Phase 4）。
