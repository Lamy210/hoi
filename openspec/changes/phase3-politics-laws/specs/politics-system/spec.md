## MODIFIED Requirements

### Requirement: 法律の制定手順

法律の変更はPP消費と所要日数を要し（SHALL）、同一slotで複数の法律を同時に有効化してはならない（SHALL NOT）。政治力は日次に `0.5＋安定度×0.5` 回復し、法律コマンドはPP不足時に却下されなければならない（SHALL）。制定は enactDays 経過後に有効化され、旧法は無効化されなければならない（SHALL）。

#### Scenario: 徴兵法の変更
- **WHEN** 総動員法を提案しPPが十分な場合
- **THEN** enactDays経過後に有効化され、旧法は無効になる

### Requirement: 支持率と安定度のトレース

支持率・安定度の計算は構成要素（生活水準・税負担・戦争・事件）をcontributorsとして公開しなければならない（SHALL）。安定度は `0.5＋支持率×0.5−(atWar?0.1:0)` として月次更新され、低安定度はorg回復と研究力にペナルティを与えなければならない（SHALL）。

#### Scenario: 支持率の根拠表示
- **WHEN** UIが支持率のトレースを要求する
- **THEN** 生活水準・税負担・戦争要因のcontributorsが返る

## ADDED Requirements

### Requirement: 政治力

politics-systemは国ごとの政治力（PP）を管理しなければならない（SHALL）。PPは日次回復し、法律制定・国家方針の消費として使われなければならない（SHALL）。PPの変動はジャーナルに記録されなければならない（SHALL）。

#### Scenario: PP不足の却下
- **WHEN** PPが法律コスト未満のとき法律を提案する
- **THEN** コマンドは却下され、理由がUIに表示される
