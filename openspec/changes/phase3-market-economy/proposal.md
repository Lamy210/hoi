# Proposal: phase3-market-economy

## Why

Phase 2までの経済は「軍需工場→装備自動産出」で、国家予算・財市場・価格・GDPが未実装。docs/03 §3の国家市場モデル（価格月次更新・貨幣保存則INV-2・GDP集計）とdocs/02 §4の「経済規模が軍事維持費の上限を決める」相互依存の基盤が必要。

## What Changes

- **国家市場**: 財（歩兵装備・火砲・食料・消費財の4財。財リストはシナリオデータ拡張可能）ごとに在庫・価格・日次需給を集計。価格は月末に `price = clamp(basePrice×(demand/supply)^0.5×平滑, 0.25×base, 4×base)`。
- **国際貿易**: 輸出余剰国↔輸入不足国の価格差マッチング（月次・戦争国間は遮断）。取引は資金移転（INV-2）。
- **国家予算**: 税収（人口×税率×所得係数）・支出（軍事維持＝師団×維持費＋軍需工場、建設、教育・福祉配分）・国庫ストック。税率レバー0-50%（支持率に波及）。国庫が枯渇すると軍事維持が縮退。
- **GDP**: 建物付加価値＋サービス部門の月末集計（5軸スコアの経済軸）。
- UI: 予算パネル（収支・税率スライダー・配分）、市場価格表示。セーブv3。

## Impact

- Affected specs: `economy-system`（貨幣保存則・価格clamp・GDP集計の実装＋国家予算）
- Affected code: economy/budget.ts（新規）・economy/market.ts（新規）・systems/economy.ts（新規）・commands.ts（setTaxRate）・core/state.ts（v3）・save/serialize.ts・ui.ts・UI・ai/ai.ts
