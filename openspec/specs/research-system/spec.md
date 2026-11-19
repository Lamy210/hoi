# research-system 仕様

## Purpose
データ駆動型の技術ツリーと研究進行（研究力・並行枠・時代制約）を管理し、技術効果（修飾子・解禁）を適用する。

## Scope
### 責務
- 技術定義（13カテゴリ・前提・費用・時代制約・効果）のスキーマと検証
- 研究力（RP）の計算（教育予算 × 大学 × 識字率）
- 研究進行（並行枠2）と完了処理
- 完了技術の修飾子適用（economy/production/military 等の係数）

### 非責務
- 予算の決定（politics/economy）
- 技術のツリー構造の編集（シナリオ/MODデータ）
- AIの研究選択（ai-system）

## Data Model
- Tech: `{id, category, era, cost, prereqs[], effects[{type, target, value}]}`（シナリオ定義）
- ResearchState: `{rp, activeProjects[], completedSet, modifiers}`

## State & Transitions
- 技術: `locked(時代/前提未成立) → available → researching → completed`。完了は不可逆。

## Calculation Rules
- 研究進行日数 = `基礎日数(cost) × 研究力係数`。`研究力係数 = f(国家RP, 技術カテゴリの国別適性)`。
- 効果は修飾子マップへの書込（他システムが参照）。解禁型効果は建物・部隊種のunlockフラグ。

## Invariants
- 前提未成立の技術は研究開始不可。時代制約外の技術はavailableにならない（シナリオの技術リストから既に除外されている場合、存在しないものとして扱う）。
- 修飾子は参照のみで他システムが書き換えない。

## Use Cases
- 工業技術「高炉」完成 → 製鉄所の産出係数上昇 → economy のGDP増。
- 1936シナリオでは「サイバー技術」カテゴリ自体がパックに存在せず、研究不可。

## Anomalies & Error Handling
- 循環前提・未知の前提キーはロード拒否。
- 並行枠超過の研究開始は却下。

## Dependencies
- 依存先: resource-system（財カタログは不要）、economy-system（教育予算の参照）、population-system（識字率）。
- 依存元: production / military / politics（修飾子参照）、game-ui（研究パネル）。

## Security & Performance
- 修飾子マップは数値インデックス参照（ホットパスで文字列検索しない）。
- 研究は日次進行（少数のactiveプロジェクトのみ）。

## Acceptance & Tests
- 前提グラフの検証（循環・未知キー）テスト。
- 効果適用のテスト（完了で係数が変化・トレース表示）。

## Requirements

### Requirement: データ駆動の技術ツリー
技術の集合・前提・効果はシナリオパックのデータによって完全に定義され（SHALL）、前提グラフの循環と未知キーはロード時に拒否されなければならない（SHALL）。

#### Scenario: 循環前提の拒否
- **WHEN** パックが循環する前提関係を含む
- **THEN** ロードは拒否され、循環経路が表示される

### Requirement: 研究進行の計算
研究の進行は研究力（教育予算・大学・識字率から計算）に依存し（SHALL）、並行枠（既定2）を超えた研究は開始してはならない（SHALL NOT）。

#### Scenario: 研究力の増減
- **WHEN** 教育予算が増加する
- **THEN** 研究進行速度が増加し、トレースで計算根拠が表示される

### Requirement: 技術効果の適用
完了した技術の効果は修飾子マップまたは解禁フラグとして一元的に適用され（SHALL）、他システムはその値を参照のみとして利用しなければならない（SHALL）。

#### Scenario: 生産係数の上昇
- **WHEN** 工業技術が完了する
- **THEN** 対象産業の産出係数が上昇し、トレースに技術要因が現れる
