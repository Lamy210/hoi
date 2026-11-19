# Design: phase3-market-economy

## Decisions

- **D-032 財構成**: MVPは4財（infEquipment/artEquipment/food/consumerGoods）。GDDの16財はシナリオデータ拡張（パックのgoods.json）として受け皿のみ用意し、現代パックは4財で開始。
- **D-033 市場**: 国家市場のみ（国際貿易は月次の余剰/不足マッチング、輸送容量はPhase 4）。価格は月末更新・在庫バッファ（在庫<0は縮退）。国民の消費財需要は 人口×0.02/日、食料需要は人口×0.01/日。
- **D-034 予算**: 国庫 `treasury[]`（v3）。税収=pop×taxRate×0.002/日。支出=師団数×2＋軍需工場×0.5＋建設ペイロール＋教育配分×研究力＋福祉×生活水準ボーナス。国庫<0で軍事維持50%縮退（org回復ペナルティ）。
- **D-035 GDP**: 月末 `GDP = Σ建物付加価値（milFactories×産出単価×(1+tech)）＋サービス（pop×0.001）`。占領州は除外。

## Risks / Trade-offs

- 4財への簡略化はGDD §3.1の16財と乖離する → goods.jsonのスキーマを先に確定し、パイプライン拡張はPhase 4（シナリオ拡大）で実データ投入。
