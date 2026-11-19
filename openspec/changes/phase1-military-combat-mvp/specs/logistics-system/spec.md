# Spec Delta

## ADDED Requirements

### Requirement: 簡易補給の初期実装
補給効率は首都をソースとする隣接グラフのDijkstra距離と距離減衰、ハブ容量比から計算され（SHALL）、週次＋dirtyイベントで再計算しなければならない（SHALL）。

#### Scenario: 距離による供給低下
- **WHEN** 師団が補給半径の外に配置される
- **THEN** supplyEffは0となり、移動速度・組織率回復が低下する

### Requirement: 包囲による供給停止
補給経路が完全に遮断された師団は供給0となり（SHALL）、組織率回復が停止し崩壊損耗の対象とならなければならない（SHALL）。

#### Scenario: 隘路占領による包囲
- **WHEN** 隘路プロヴィンスが占領され下流の補給経路が消える
- **THEN** 下流師団のsupplyEffは0になり、包囲崩壊処理が開始される
