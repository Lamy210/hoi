# Proposal: phase3-construction

## Why

経済成長の主経路「建設」が未実装。軍需工場・インフラを自国州へ建設し、産出と補給を伸ばすプレイ（軍事以外の報酬）を成立させる。

## What Changes

- **建設プロジェクト**: コマンド startConstruction {province, type: milFactory|infra}。コスト実消費（資金のみMVP: 工場8,000・インフラ5,000）、工期=基準日数×(1.2−infra×0.04)。同時進行は2件まで。
- **完了**: 建物レベルの更新はconstruction-system経由のみ（baselineどおり）。軍需工場は州のmilFactories+1、infraは州infra+1（上限10）。
- **建設ペイロール**: 進行中のプロジェクトは日次で労働者を雇用し、失業率とGDP（建設部門）に反映。
- UI: 州パネルに建設ボタン、予算パネルに進行中プロジェクト。セーブv3。

## Impact

- Affected specs: `construction-system`（建設コストの実消費・建物レベルの更新は一経路）
- Affected code: systems/construction.ts（新規）・commands.ts（startConstruction）・systems/population参照・core/state.ts（v3）・UI・i18n
