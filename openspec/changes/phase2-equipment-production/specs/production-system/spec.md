## ADDED Requirements

### Requirement: 生産ラインによる装備産出

production-systemは国の軍需工場を財種へ配分する生産ラインを提供しなければならない（SHALL）。配分率 artShare ∈ [0, 0.5] はコマンドで設定し、日次産出は `歩兵装備 = 工場×(1−artShare)×2`、`火砲 = 工場×artShare×1.2` として決定論的に計算しなければならない（SHALL）。財は2種（歩兵装備・火砲）とし、価格形成や貿易は含めない（Phase 3のeconomy-system）ものとする（MAY NOT）。

#### Scenario: 配分の変更
- **WHEN** プレイヤーが artShare を0.3に設定する
- **THEN** 日次産出が式どおりに変化し、変更はジャーナルに記録される
