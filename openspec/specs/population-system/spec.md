# population-system 仕様

## Purpose
人口を「地域単位の集約モデル」で管理する（個人単位のシミュレーションは行わない）。年齢構成・識字率・就業・生活水準・満足度・成長・移動・徴兵可能人口を計算する。

## Scope
### 責務
- プロヴィンス集約popの状態管理（年齢3区分・識字・雇用（産業別）・失業・所得・生活水準・満足度）
- 成長（出生・死亡）・移動（賃金差・生活水準差・距離・治安）の月次計算
- 難民（戦域流出）の移動（Phase 3）
- 徴兵可能人口の一元計算（徴兵制度率は politics-system の値を参照）

### 非責務
- 雇用の需要側（production-system の労働需要）
- 個人・家計単位のシミュレーション（禁止、docs/02 §8）
- 支持率の計算（politics-system が生活水準を消費して計算）
- 徴兵の実行（military-system）

## Data Model
- popDetail（プロヴィンス別構造体配列）: `total, age0_14, age15_64, age65p, literacy, employedBySector(疎), unemployed, incomeAvg, livingStandard, satisfaction`
- 徴兵制度率は politics-system から参照（書き換えない）。

## State & Transitions
- 月次更新: 成長 → 移動 → 雇用再配分 → 指標更新。戦争による直接減（占領時の流出）はcombat/militaryがコマンドで通知。

## Calculation Rules
- 出生 = `基準出生率 × 生活水準修飾`、死亡 = `基準死亡率 × (医療技術修飾, 飢饉, 戦争)修飾`（基準値はシナリオデータ）。
- 移動の純流入 = `f(賃金差, 生活水準差, 距離, 治安)`（月次・上限付きで爆発移動を防止）。
- 生活水準 = `f(消費財充足, 食料充足, 所得)` ∈ [0,1]。
- 徴兵可能人口 = `age15_64 × 徴兵制度率 × (1 − 既徴兵分 − 軍需雇用分)`。

## Invariants
- 年齢区分の合計 = 総人口（不整合は検知・fail fast）。
- 人口は負にならず、移動は人口保存（出発分=到着分、難民の消滅は明示コマンドのみ）。
- 全プロヴィンス人口の合計は国の人口合計と一致（総和整合）。

## Use Cases
- 消費財不足 → 生活水準低下 → 満足度低下 → politics の支持率へ波及。
- 戦争で戦域から隣接安全地域へ難民が流出し、受入側の雇用圧力が増す。

## Anomalies & Error Handling
- 総和違反の検知はfail fast（データ破損の早期発見）。
- 人口0のプロヴィンスは雇用0・徴兵0（特別扱いはしない）。

## Dependencies
- 依存先: province-system（所属）、economy-system（消費充足・賃金）、politics-system（徴兵制度率の参照値）。
- 依存元: country / military / politics / economy / game-ui（人口パネル）。

## Security & Performance
- 月次計算はプロヴィンス単位の逐次処理。ティアL（20k州）で実測（docs/13）。
- 移動の相手探索は「近傍のみ」（距離上限）で計算量を制御。

## Acceptance & Tests
- 総和整合・人口保存のプロパティテスト。
- 徴兵可能人口のユニットテスト（徴兵制度率の境界）。

## Requirements

### Requirement: 地域集約モデル
population-systemは地域（プロヴィンス）単位の集約値で人口を管理しなければならず（SHALL）、個人単位のエンティティを生成してはならない（SHALL NOT）。

#### Scenario: 人口集約の参照
- **WHEN** UIがプロヴィンスの人口詳細を表示する
- **THEN** 年齢構成・識字率・就業等の集約値が表示される（個人は存在しない）

### Requirement: 徴兵可能人口の一元計算
徴兵可能人口の計算は population-system が一元的に行い（SHALL）、military・politics はその値を参照のみで使わなければならない（SHALL）。

#### Scenario: 徴兵制度の変更
- **WHEN** 総動員法が有効化される
- **THEN** 次の月次で徴兵可能人口が増加する（単一の計算元から）

### Requirement: 人口の総和整合
年齢区分の合計は総人口と一致し（SHALL）、プロヴィンス合計は国合計と一致しなければならない（SHALL）。違反はfail fastで検知される。

#### Scenario: 移動による保存
- **WHEN** プロヴィンスAからBへ人口が移動する
- **THEN** 国の総人口は不変で、A/Bの人口差分が一致する
