# Proposal: phase3-politics-laws

## Why

支持率・安定度・法律・政治力はdocs/03 §2.1の主要レバーだが未実装。税率や徴兵法のトレードオフ（税↑→支持率↓→安定度↓）を可視化し、軍事以外の経路に報酬を与える。

## What Changes

- **支持率・安定度**: contributors（生活水準・税負担・戦争・事件）を公開（baselineどおり）。安定度は支持率と戦争状態から月次更新、低安定度はorg回復・研究力にペナルティ。
- **政治力（PP）**: 日次回復（安定度依存）。法律制定で消費。
- **法律slot**: 徴兵法（志願/徴兵/総動員：動員率・安定度ペナルティ）と経済法（計画/混合/自由市場：工場産出係数vs生活水準ボーナス）。PP消費＋enactDays＋slot排他（baselineどおり）。
- UI: 法律パネル（現行法・制定ボタン・PP表示）、支持率contributors表示。セーブv3。

## Impact

- Affected specs: `politics-system`（法律の制定手順・支持率と安定度のトレースの実装）
- Affected code: systems/politics.ts（新規）・military/conscription参照・commands.ts（enactLaw）・core/state.ts（v3）・UI・i18n
