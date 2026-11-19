# Proposal: phase3-population-labor

## Why

人口は現在パック定数で、GDD §2.1の「人口・労働人口・失業率・教育水準」が動かない。生活水準（5軸スコアの国民生活軸）と徴兵・研究・税収の相互依存（docs/02 §4）の基盤が必要。

## What Changes

- **人口の日次成長**: `pop×(0.0001＋生活水準ボーナス−戦争ペナルティ)`。プロヴィンス集約値のみ（個人エンティティなし）。
- **労働・失業**: 労働人口=pop×参加率(0.55)、雇用=軍需工場×1000＋建設ペイロール、失業率=1−雇用/労働人口。
- **生活水準**: `clamp(0.4＋GDP/人口×係数＋消費財充足ボーナス−税負担ペナルティ−戦争ペナルティ, 0, 1)`。
- **識字率**: 教育配分と法律で上昇（研究力と生活水準に寄与）。
- **徴兵可能人口の一元計算**: population-systemが法律の動員率を反映した値を一元的に計算（baselineどおり）。
- UI: 州パネルに人口/生活水準/失業率表示。セーブv3（provinces.population は動的に）。

## Impact

- Affected specs: `population-system`（徴兵可能人口の一元計算・人口の総和整合）
- Affected code: systems/population.ts（新規）・military/conscription.ts（徴兵計算の参照元）・core/state.ts・hash.ts・serialize.ts・ui.ts・UI
