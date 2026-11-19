# Proposal: phase2-equipment-production

## Why

Phase 1の装備は抽象ストック1種で、GDD §3/§4の「財の実装: 歩兵装備・火砲等（シナリオ定義）」「軍需工場の生産配分」「師団テンプレート」が未実装。軍事の深み（砲兵を持つ師団の優位・生産配分のトレードオフ）を導入する。

## What Changes

- **財**: `inf_equipment`（歩兵装備）と `art_equipment`（火砲）の2種を国庫ストックとして管理（市場化はPhase 3）。
- **生産ライン**: 軍需工場の配分率 `artShare` を国単位で設定（コマンド setProductionShare、0〜0.5に制限）。日次産出: 歩兵装備 = 工場×(1-share)×2、火砲 = 工場×share×1.2。
- **師団テンプレート**: 歩兵師団テンプレート（人力10,000＋歩兵装備1,000＋火砲200）。作成・補充が両財を消費。戦闘力に火砲充填率の係数（装備係数を2財の幾何平均へ拡張）。
- **指揮官**: 国ごとに決定論生成（8人・スキル1-5・特性: 攻撃/防御/兵站）。師団へ割当（1師団1人）。戦闘力にスキル係数（1+skill×0.04、特性で攻/防側に+0.06）。月次に経験でスキル上昇の可能性（決定論ロール）。
- UI: 生産配分パネル、指揮官パネル（一覧・割当）、i18n。セーブv2（ストック・share・指揮官）。

## Impact

- Affected specs: `production-system`（生産ライン）、`military-system`（テンプレート費用・指揮官）
- Affected code: economy/production.ts（拡張）、military/commanders.ts（新規）、combat.ts（装備係数・指揮官係数）、commands.ts、core/state.ts、save/serialize.ts、ui.ts、UI、ai/ai.ts
