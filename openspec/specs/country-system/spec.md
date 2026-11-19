# country-system 仕様

## Purpose
国家（プレイヤー/AIの行動主体）の状態と指標を管理する。国家はプレイヤーとAIで同一のシミュレーション経路を持つ（チートなし原則）。

## Scope
### 責務
- CountryStore の保持: 名称・色・首都・政体・国庫・税率・安定度・支持率・戦争支持率・政治力・兵力プール
- 国家指標（5軸スコア・GDP等）の集計とトレース提供
- 国家消滅（首都喪失＋全領土喪失）の状態管理
- 関係値・戦争・条約の参照窓口（保持はdiplomacy-system、国家側の状態は本システム）

### 非責務
- 政治の計算（politics-system）、経済計算（economy-system）、軍事行動（military-system）
- AIの判断（ai-system）
- 領土の管理（province-system）

## Data Model
docs/07 §2.2 参照。`treasury: i64`（クレジット・整数）、指標は f64、laws/policies は疎配列、flags はイベント用フラグ。

## State & Transitions
- 国家: `active → extinct`（全領土喪失で消滅。全参照の整理は一括）
- 国庫: 収支コマンドで増減。負値は国債発行コマンドのみが許可する（Phase 3）。

## Calculation Rules
- 5軸スコア（docs/02 §4）: 軍事力・経済規模・外交影響力・技術水準・生活水準。月末集計、履歴保持（グラフ用）。
- 労働人口・徴兵可能人口は population-system から供給される値を参照（一元化）。

## Invariants
- 存続国家は必ず首都プロヴィンスを持ち、首都はその国家に属する（戦時中はcontrollerが変わることを許容）。
- 国庫・指標の変化はすべてコマンド経由（INV-3）。

## Use Cases
- 月末にGDP・スコアが更新され、UIの国家概要パネルが再描画される。
- AIが国家状況（国庫・安定度・スコア）を評価して戦略スタンスを決める。

## Anomalies & Error Handling
- 未知の国家ID参照は検証エラー（fail fast）。
- 首都の占領: 国家は存続し、`capitalLost` フラグで事件イベントと補給ソース移転（logistics）を起動。

## Dependencies
- 依存先: game-core、province-system（領土）、scenario-system（初期定義）。
- 依存元: politics / diplomacy / economy / ai / game-ui。

## Security & Performance
- 国家スコアの計算は月末1回（cadence分散）、トレースはオンデマンド。
- セーブには指標履歴を圧縮系列（月次サンプリング）で保存。

## Acceptance & Tests
- スコア計算のユニットテスト（トレース含む）。
- 国家消滅フローのテスト（参照切れが残らないこと）。

## Requirements

### Requirement: 同一シミュレーション原則
プレイヤー国家とAI国家は同一のコマンド・同一の計算経路を通らなければならない（SHALL）。AIに対してゲーム内リソースを無償付与するコード経路があってはならない（SHALL NOT）。難易度ボーナスは ai-system の明示的・上限つき機構のみで行う。

#### Scenario: AI国家の経済評価
- **WHEN** AI国家が資源不足に陥る
- **THEN** プレイヤー国家と同一の市場計算で不足が解決される

### Requirement: 国家指標のトレース
国家概要の主要指標（安定度・支持率・GDP・スコア）は計算根拠（contributors）を要求可能でなければならない（SHALL）。

#### Scenario: 安定度の根拠表示
- **WHEN** UIが安定度のトレースを要求する
- **THEN** 支持率・無秩序・イベント要因のcontributorsが返る

### Requirement: 国家消滅の処理
国家の全領土喪失は国家を消滅状態に遷移させ、参戦戦争・条約・市場・AIスケジュールの参照を一括で整理しなければならない（SHALL）。

#### Scenario: 国家の消滅
- **WHEN** ある国家の全プロヴィンスが他国に割譲される
- **THEN** その国家は消滅し、戦争から脱退・条約は無効化され、AIスケジュールから除外される
