# economy-system 仕様

## Purpose
財市場（在庫・価格・需給）、貿易、予算・GDPなど国家経済の集約モデルを担う。単純な資金増減ではなく、資源・労働・産業・需要の相互依存を表現する。

## Scope
### 責務
- 国家市場の在庫・価格・日次需給の集計
- 月次の価格更新（clamp・平滑・在庫バッファ）
- 国間貿易のマッチング（協定・関係・制裁による制約）
- 予算・税収・国債・GDP集計と貨幣の帳簿（gov/households/industry）
- ショック伝播（不足→稼働率低下→失業・消費不足）の計算

### 非責務
- 生産方法の定義（production-system）、建物の建設（construction-system）
- 労働の供給計算（population-system が供給、本システムは需要）
- 通貨・為替のモデル化（MVPでは抽象単位、docs/03 §0）
- 領土の効力（province/country-system）

## Data Model
docs/07 §2.6。`{stock, price, basePrice, demand, supply, importCap}` × 財、moneyLedgers。価格は float64、在庫は float64（負禁止）。

## State & Transitions
- 市場: 毎月末に価格更新。戦争・制裁で貿易ペアが遮断される。
- 税収: 月次。支出配分は国家方針（politics-system）のコマンドで変更。

## Calculation Rules
- 価格更新: `price = clamp(basePrice × (demand/supply)^0.5 × 平滑係数, 0.25×basePrice, 4×basePrice)`（月次）。需給差は在庫で吸収。
- GDP = Σ(建物の付加価値) ＋ サービス部門。月末集計。
- 貿易: 輸出余剰×輸入不足を価格差順にマッチング（上限: 協定・輸送容量・関係）。

## Invariants
- INV-2: 貨幣保存則。全取引は売買間の移転のみ。
- INV-4: 在庫・現金は負にならない。
- 全建物の投入/産出は production-system 定義と一致し、収支台帳で突合可能。

## Use Cases
- 戦争で資源産地を失う → 国内供給減 → 価格上昇 → 下流産業の稼働率低下 → 失業と消費財不足 → 生活水準・支持率低下。
- 制裁発動 → 輸入断絶 → 代替調達（高価格）または不足。

## Anomalies & Error Handling
- 在庫枯渇: 購入は在庫範囲で縮退（欠品フラグ）。負在庫を作らない。
- 発散検知: 価格がclamp上限に連続N月張り付く場合は「経済危機」イベントを発行（安定化はclamp機構とイベントで対応）。

## Dependencies
- 依存先: resource-system（財定義）、production-system（産出）、population-system（労働・消費）、province-system（損壊）。
- 依存元: construction / military（装備購入）/ politics（税） / game-ui（貿易・財政パネル）。

## Security & Performance
- チート検証: 全資金移転が帳簿突合を通ること（property test）。
- 計算は月次＋国家単位の逐次処理。ティアL（250国×16財）の月次コストは実測（docs/13）で評価し、必要なら差分更新へ拡張。

## Acceptance & Tests
- 貨幣保存則・負在庫禁止のプロパティテスト。
- 50年×20シードの安定性テスト（docs/13 §4）。
- 資源喪失シナリオの伝播テスト（ゴールデン）。

## Requirements

### Requirement: 貨幣保存則
economy-systemは、全ての取引を売手と買手の間の資金移転として実装しなければならず（SHALL）、取引によって世界の総資金量が変化してはならない（SHALL NOT）。

#### Scenario: 貿易取引の帳簿突合
- **WHEN** 国家Aが国家Bから財を輸入する
- **THEN** Aの現金減少額とBの現金増加額が一致する

### Requirement: 価格のclamp
価格更新は basePrice の0.25倍〜4倍にclampされなければならず（SHALL）、在庫が負になる取引は縮退しなければならない（SHALL）。

#### Scenario: 品薄による価格上昇
- **WHEN** 需要が供給を大きく上回る
- **THEN** 価格は上昇するがbasePriceの4倍を超えず、在庫は負にならない

### Requirement: GDP集計
GDPは全建物の付加価値（産出額−投入額）とサービス部門の合計として月末に集計されなければならない（SHALL）。

#### Scenario: 産地喪失のGDP影響
- **WHEN** 資源産地の占領で鉱山が稼働停止する
- **THEN** 次の月次集計で該当建物の付加価値がゼロになりGDPが減少する
