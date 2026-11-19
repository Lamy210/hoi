# mod-system 仕様

## Purpose
シナリオ・コンテンツの拡張（MOD）を読み込み・検証・競合解決する。MVPではデータMOD（宣言的データのみ）を提供し、実行コードは含めない（D-007）。

## Scope
### 責務
- MODパック（manifest・依存・互換エンジン版・checksum）の列挙・検証
- ベースパックとのマージ・オーバレイ（財・産業・技術・イベント・マップ・ローカライズ）の競合解決
- 検証器の呼び出し（save-system配下の共通バリデータ）
- 無効MODの拒否と理由表示

### 非責務
- 検証器の実装本体（save-system）
- MOD配布のホスティング（後期: Bun+Hono等の別検討）
- 実行コード（JSスクリプト）のサンドボックス（MVPでは提供しない。Phase 5で検討）

## Data Model
- ModManifest: `{name, version, engineCompat, dependencies[], provides[], conflicts[], checksums}`
- 読込順: dependencies解決 → conflicts検証 → オーバレイ適用（後勝ちまたは明示merge宣言）

## State & Transitions
- MOD: `discovered → validated → enabled | disabled(reason)`。無効化はUI操作で可能（問題切り分け用）。

## Calculation Rules
- オーバレイはリソース種別ごとの規定: 財・技術は「追加/置換」宣言、イベントは「追加」、マップは「置換（大重）」。
- 依存の循環・未解決は検証失敗。

## Invariants
- 検証を通らないMODはゲームに一切影響しない。
- 同一財キーの二重定義（依存関係未宣言）は検証失敗（暗黙の上書き禁止）。

## Use Cases
- MODが新財と関連産業・イベントを追加 → ベースパック上で整合検証 → 有効化。
- 不正MOD（checksum不一致・巨大ファイル・未知キー）を自動で拒否。

## Anomalies & Error Handling
- 全違反を収集して一覧表示（scenario-system と同一UX）。
- 依存MOD無効化時は依存先も自動無効化（選択表示）。

## Dependencies
- 依存先: save-system（共通バリデータ）、scenario-system（パック読込経路）。
- 依存元: game-ui（MOD管理画面）、data-pipeline（MOD作成ツール連携）。

## Security & Performance
- ファイルサイズ上限（単一MOD 200MB・警告）、未知のファイル種別は拒否。
- 実行コード（script/ 非宣言ファイル）はMVPで読込拒否（セキュリティ要件）。

## Acceptance & Tests
- 有効MOD（財追加・イベント追加）の統合テスト。
- 不正MOD（循環依存・checksum不一致・script混入）の拒否テスト一式。

## Requirements

### Requirement: データMODの検証付き読込
mod-systemはMODのmanifest・依存・互換・checksum・参照整合を検証し（SHALL）、違反MODは一切のゲーム影響を与えずに拒否しなければならない（SHALL）。

#### Scenario: 循環依存の拒否
- **WHEN** 2つのMODが互いに依存を宣言する
- **THEN** 両MODは拒否され、循環経路が表示される

### Requirement: 実行コードの禁止
MVPのMODは宣言的データのみを許可し（SHALL）、実行可能コード（script等）を含むMODは読み込んではならない（SHALL NOT）。

#### Scenario: script混入の拒否
- **WHEN** MODにscript/配下の実行ファイルが含まれる
- **THEN** そのMODは検証失敗として拒否される

### Requirement: 競合解決の明示性
同一リソースキーの衝突は依存順とmerge宣言に基づいて解決され（SHALL）、宣言されていない暗黙の上書きを許容してはならない（SHALL NOT）。

#### Scenario: 暗黙上書きの拒否
- **WHEN** 依存関係を宣言せずに同一財キーを二重定義する
- **THEN** 検証は失敗し、衝突キーが表示される
