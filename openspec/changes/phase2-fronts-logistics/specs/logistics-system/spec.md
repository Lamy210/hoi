## MODIFIED Requirements

### Requirement: 補給効率の計算
logistics-systemは補給ソースからのグラフ距離とハブ容量から、各プロヴィンス・各国の supplyEff ∈ [0,1] を決定論的に計算しなければならない（SHALL）。capacityFactor はハブ（首都＋都市地形の州・実効支配国のもの）の容量 `6 + 3×infra` に対する割当師団数の比 `clamp(hubCapacity / demand, 0, 1)` から決定し、容量超過の師団は supplyEff が0.5倍に減衰しなければならない（SHALL）。

#### Scenario: 距離による減衰
- **WHEN** 部隊が補給半径を超える位置に配置される
- **THEN** supplyEff は0になり、消費側（org回復・戦闘力）に補給不足が適用される

#### Scenario: 容量超過による減衰
- **WHEN** 1つの補給圏に容量を超える師団が集中している
- **THEN** 容量を超えた師団の supplyEff は0.5倍に減衰する

#### Scenario: ハブの喪失
- **WHEN** 都市ハブ州が敵に占領される
- **THEN** 該当ハブの容量が失われ、依存する師団の supplyEff が低下する
