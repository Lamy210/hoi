# politics-system 仕様

## Purpose
政治力・支持率・安定度・政党・法律・国家方針（条件ゲート型ツリー）を管理し、国家の内政レバーを提供する。

## Scope
### 責務
- 政治力（PP）の蓄積と消費（法律・方針・外交行動）
- 支持率・安定度・戦争支持率の計算（トレース付き）
- 法律（徴兵・経済・貿易・労働・教育）の制定手順（PP消費・所要日数・反対団体の反発）
- 政党・利益団体の状態と選挙/政体の効果（現代シナリオ: 選挙周期、歴史: 継承形態）
- 国家方針ツリー（条件ゲート・exclusiveGroup）の取得管理
- 政治危機・革命の状態遷移（安定度25以下で危機、0で革命MTTH）

### 非責務
- 人口の計算（population-system；生活水準はpopulationが提供し、politicsは消費）
- 税収計算（economy-system；税率はpoliticsが決めてeconomyが計算）
- AIの判断（ai-system）
- イベントの内容定義（event-system）

## Data Model
- Law: `{slot, options[{id, effects, requirements}], enactDays, ppCost}`
- FocusTree: `{nodes[{id, requirements, exclusiveGroup?, effects, costPP, durationDays}]}`
- Party / InterestGroup: 政軸（民主↔権威・市場↔計画・孤立↔国際）上の位置＋支持popの集約。

## State & Transitions
- 法律: `proposed → enacting(days) → enacted | failed(反対過半)`
- 方針ノード: `locked → available(条件成立) → acquiring → acquired`。exclusiveGroup は排他。
- 安定度: `>25 正常 → ≤25 危機 → =0 革命MTTH開始 → 革命イベント`

## Calculation Rules
- PP蓄積 = `base × 政府効率（政体・安定度関数）`（日次）。
- 支持率 = `f(生活水準, 税負担, 戦争状況, 事件)`（週次・トレース付き）。
- 方針ノードのavailable判定は年・政体・安定度・既得ノード・戦争状態の条件式（データ駆動）。

## Invariants
- 同一exclusiveGroupのノードは最大1つ取得済み。
- 法律slotは常に1つだけ有効。
- 安定度・支持率は [0,100] の範囲を維持。

## Use Cases
- 総動員法 → PP消費・60日 enactment → 徴兵率上昇（population-systemの参照値が変化）・支持率低下。
- 「軍備拡張」方針を取得 → 軍需工場の生産係数上昇（economy/productionへ修飾子適用）。

## Anomalies & Error Handling
- PP不足の提案は却下。enacting中の再提案は不可（slot単位）。
- 条件が不成立に戻った方針（政体変更等）は効果を無効化し、UIに警告。

## Dependencies
- 依存先: country-system（国家状態）、population-system（生活水準）、economy-system（税率の計算先）。
- 依存元: research（教育予算の参照）、ai-system、game-ui（政治パネル）。

## Security & Performance
- 方針ツリーはシナリオ/MODデータ駆動（コードに固定ツリーを持たない）。
- 支持率は週次計算。トレースはオンデマンド。

## Acceptance & Tests
- 法律制定フローのテスト（PP消費・日数・効果適用）。
- exclusiveGroup・条件ゲートのテスト。政体変更でノード効果が無効化されることのテスト。

## Requirements

### Requirement: 条件ゲート型の国家方針
国家方針ツリーはデータ駆動で定義され（SHALL）、ノードの出現は年・政体・安定度・既得ノード等の条件ゲートによって決まらなければならない（SHALL）。固定の一本道ツリーをコードに埋め込んではならない（SHALL NOT）。

#### Scenario: 状況依存の利用可能ノード
- **WHEN** 安定度が25以下に低下する
- **THEN** 条件に安定度が含まれるノードが利用可能/不可能に変化する

### Requirement: 法律の制定手順
法律の変更はPP消費と所要日数を要し（SHALL）、同一slotで複数の法律を同時に有効化してはならない（SHALL NOT）。

#### Scenario: 徴兵法の変更
- **WHEN** 総動員法を提案しPPが十分な場合
- **THEN** enactDays経過後に有効化され、旧法は無効になる

### Requirement: 支持率と安定度のトレース
支持率・安定度の計算は構成要素（生活水準・税負担・戦争・事件）をcontributorsとして公開しなければならない（SHALL）。

#### Scenario: 支持率の根拠表示
- **WHEN** UIが支持率のトレースを要求する
- **THEN** 生活水準・税負担・戦争要因のcontributorsが返る
