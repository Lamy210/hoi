# event-system 仕様

## Purpose
データ駆動のイベント機構（条件トリガ・MTTH・選択肢・効果）を提供する。チュートリアルもこの機構で実装する（D-014）。

## Scope
### 責務
- イベント定義のスキーマ（trigger条件DSL・mtth/onCondition・options・effects・aiWeight）
- 条件評価（週次サンプリング）と起動管理（cooldown・firedフラグ）
- 効果の実行はコマンド列として発行（決定論・リプレイ対応）
- AIの選択重み（aiWeight）の計算

### 非責務
- 効果の内容定義（シナリオ/MODデータ）
- 表示（game-ui のモーダル）
- 効果コマンドの種類（各ドメインのコマンドを参照するのみ）

## Data Model
- Event: `{id, trigger(条件式), mtth(days)|onCondition, cooldownDays, options[{text, effects[Command], aiWeight}]}`
- EventRuntime: `{activeEvents, firedFlags, cooldowns}`

## State & Transitions
- イベント: `armed → fired(選択待ち) → resolved`。同tickに同一イベントの二重発火はしない。

## Calculation Rules
- MTTH方式: 週次サンプリングで `P(発火) = min(1, Δt / mtth(状態))`（決定論ロール）。onCondition方式は条件成立時に即発火（cooldown優先）。
- aiWeight = `f(オプションの効果, 国家状態)`（シナリオ定義の重み関数 or 内蔵デフォルト）。

## Invariants
- 効果は必ずコマンド列として適用される（直接状態変更の禁止、INV-3）。
- 同一イベントの同tick二重発火禁止。firedFlags の適用範囲（country/province/global）はデータで宣言。

## Use Cases
- 安定度25以下で「政治危機」イベントがMTTHで発火 → 選択肢（譲歩/鎮圧）→ 効果はコマンド列。
- チュートリアル: 「開始→地図操作」ガイドがイベントとして順次発火。

## Anomalies & Error Handling
- 未知の効果コマンド・未知の条件キーはロード拒否。
- 発火待ちイベントが50を超えたら低優先度を延期（UIの過負荷防止）。

## Dependencies
- 依存先: game-core（コマンド）、country/province（状態参照）。
- 依存元: scenario-system（定義）、game-ui（モーダル）、mod-system（追加イベント）。

## Security & Performance
- イベントデータは全て宣言的（実行コードを含まない、MVP方針 D-007）。
- 週次サンプリング。イベント数上限1,000/パック（警告）。

## Acceptance & Tests
- MTTHの分布テスト（決定論シード×多数試行で期待頻度整合）。
- 効果コマンド列の適用テスト（リプレイ一致）。

## Requirements

### Requirement: データ駆動のイベント定義
イベントは宣言的データ（条件・MTTH・選択肢・効果）で定義され（SHALL）、イベント定義内に実行コードを含めてはならない（SHALL NOT）。

#### Scenario: MODイベントの追加
- **WHEN** MODが新イベントを定義する
- **THEN** 検証を通過した後に通常イベントと同じ経路で発火する

### Requirement: 効果はコマンド列
イベントの効果はコマンド列として適用され（SHALL）、イベント処理による直接の状態書き換えがあってはならない（SHALL NOT）。

#### Scenario: 効果のリプレイ一致
- **WHEN** イベント発火を含むリプレイを再実行する
- **THEN** 同一の効果が適用され状態ハッシュが一致する

### Requirement: チュートリアルのイベント実装
チュートリアルはイベント機構（条件トリガ・選択肢・効果）で実装されなければならず（SHALL）、チュートリアル専用の別機構を追加してはならない（SHALL NOT）。

#### Scenario: チュートリアルの進行
- **WHEN** プレイヤーがガイド対象の操作を完了する
- **THEN** 次のガイドイベントが条件成立として発火する
