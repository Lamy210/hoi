# production-system 仕様

## Purpose
建物（産業）の生産方法（投入財 → 産出財・労働需要）と稼働率を管理し、実産出を計算する能力である。市場に供給される財の源泉として経済システムの中核をなし、投入不足や労働不足が即座に産出に反映されることを保証する。

## Scope
### 責務
- 生産方法（production method）の定義・選択・切替
- 稼働率（投入充足・労働充足・技術係数）の計算と実産出への反映
- 産出の市場への供給記録と投入の消費要求（economy-system と連携）

### 非責務
- 建物の建設・損傷（construction-system）
- 市場価格の決定（economy-system）
- 労働の供給側計算（population-system）
- 軍事装備の需要発行（military-system が需要者、productionは軍需工場の生産のみ）

## Data Model
- ProductionMethod: `{inputs: {good: qty}, outputs: {good: qty}, workers: n, techBonusKey?}`（シナリオ定義）
- BuildingState: `{type, level, methodId, activeRatio}`（プロヴィンス×種別アドレス）

## State & Transitions
- 稼働率: `0..1`、投入不足・労働不足で低下、回復で上昇（即時、日次評価）。
- 方法切替: コマンド（コストはシナリオ定義）。

## Calculation Rules
- 実産出 = `outputs × level × activeRatio × techModifier`
- 投入要求 = `inputs × level × activeRatio`
- activeRatio = `min(投入充足率, 労働充足率, 1)`

## Invariants
- 投入なしで産出が正となる生産方法は禁止（資源不正生成防止、docs/15 R-07）。
- 実産出の総額は市場の供給記録と一致する。

## Use Cases
- 鋼鉄不足 → 製油所の投入不足 → 稼働率低下 → 消費財産出減 → 市場で消費財価格上昇。
- 技術で新方法解禁 → プレイヤーが切替 → 労働需要が変化し雇用が再配分される。

## Anomalies & Error Handling
- 未知の財キーを含む生産方法はロード拒否。
- 産出が投入を無条件に上回る極端な方法は、パック検証で「収支率」警告を出す（バランス情報）。

## Dependencies
- 依存先: resource-system（財）、economy-system（市場・労働給付）、research-system（技術係数）。
- 依存元: construction / military（装備生産） / game-ui（生産パネル）。

## Security & Performance
- 生産方法の全収支は検証で台帳突合可能。
- 月次計算は建物単位の逐次処理（ティアLで実測）。

## Acceptance & Tests
- 「投入なし産出禁止」の検証テスト。
- 稼働率の境界値テスト（投入0%・100%）。

## Requirements

### Requirement: 生産方法の入出力整合
全ての生産方法は投入財と産出財を宣言し（SHALL）、投入ゼロで産出が正となる方法は定義してはならない（SHALL NOT）。

#### Scenario: 不正な生産方法の拒否
- **WHEN** パックが投入なしで産出が正の方法を含む
- **THEN** ロードは拒否され、該当方法が表示される

### Requirement: 稼働率による出力調整
実産出は建物レベル・稼働率・技術係数の積として計算され（SHALL）、稼働率は投入充足率と労働充足率の最小値を超えてはならない（SHALL NOT）。

#### Scenario: 投入不足の稼働低下
- **WHEN** 鋼鉄の在庫が需要を満たせない
- **THEN** 該当建物の稼働率は鋼鉄充足率以下に低下し、産出が減少する
