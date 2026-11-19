# Design: phase3-population-labor

## Decisions

- **D-036 人口成長**: 日次 `pop×(0.0001＋(living−0.5)×0.0002−(atWar?0.0001:0))`。ティアMでもO(provinces)で軽量。占領州は成長0。
- **D-037 生活水準の係数**: `0.4 ＋ min(0.3, GDPcap×0.4) ＋ (consumerOK?0.1:−0.1) − taxRate×0.2 − (atWar?0.05:0)`、clamp(0,1)。識字率は別変数で `＋教育配分×0.0001/日`（上限0.99）。
- **D-038 徴兵の一元化**: `conscriptionPool(c) = Σprov.pop × mobilizationRate(law)` を population.ts が計算し、militaryは参照のみ（既存manpowerPoolは「訓練済み人力」として併存）。月次で反映。
