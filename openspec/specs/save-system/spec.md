# save-system 仕様

## Purpose
ゲーム状態のスナップショット、永続化（IndexedDB・ファイル）、バージョン管理・移行、不正セーブの検証を担う。

## Scope
### 責務
- WorldState の直列化（ストアごとのtyped array → msgpack）と復元
- Header（version・schemaHash・worldSeed・scenarioPackId・tick）の管理
- バージョン移行チェーン（migrations/）の実行
- 復元時の整合検証（負値・範囲外・参照切れ）と拒否
- 自動セーブ（毎ゲーム月）・手動スロット（10）・エクスポート/インポート
- 検証器の共通実装（mod-system が再利用）

### 非責務
- スナップショットの内容定義（ストア構造は各システム）
- 保存先の選択UI（game-ui）
- derivedCache の保持（復元後に再計算する）

## Data Model
docs/07 §4。`.orbis` = `{header, stores(msgpack), rngState, integrity(SHA-256)}`。

## State & Transitions
- セーブ: `snapshot → serialize → verify → persist | reject`。ロード: `read → verify → migrate → restore → recompute → publish`。

## Calculation Rules
- 直列化は決定論的（同一状態 → 同一バイト列）。integrity は全体のSHA-256。
- スロットは最新順・各スロットにメタ（tick・日付・シナリオ）を保持。

## Invariants
- INV-8: セーブ→ロード後の状態ハッシュは元状態と一致。
- 不明バージョン・検証違反・checksum不一致のセーブはロードしない。

## Use Cases
- プレイヤーが月末自動セーブを確認し、いつでも復帰。
- セーブファイルを他環境へ持ち込み（インポート）して継続。

## Anomalies & Error Handling
- QuotaExceededError: ユーザーに容量警告＋古い自動セーブの削除提案＋ファイルエクスポートの案内。
- 検証違反: 拒否理由一覧を表示（不正改ざん・破損の区別）。

## Dependencies
- 依存先: game-core（スナップショットAPI）、scenario-system（packId検証）。
- 依存元: game-ui（セーブ画面）、mod-system（検証器再利用）。

## Security & Performance
- セーブの読込は信頼できない入力として扱う（範囲検証・参照検証必須）。
- ティアSでセーブ<3MB・保存/読込<300ms（実測ゲート、docs/13）。

## Acceptance & Tests
- 往復ハッシュ一致テスト（INV-8、CI必須）。
- 移行テスト（旧バージョン→現行）。
- 不正データ（負値・参照切れ・checksum不一致）の拒否テスト。

## Requirements

### Requirement: スナップショットの往復一致
セーブ→ロード後の状態は、セーブ時点の状態ハッシュと一致しなければならない（SHALL）。

#### Scenario: 往復一致
- **WHEN** 任意tickでセーブし、直ちにロードする
- **THEN** 状態ハッシュが一致し、その後のシミュレーション結果も一致する

### Requirement: バージョン検証と移行
ロード時はheader.versionを検証し（SHALL）、不明バージョンは拒否し（SHALL NOT）、既知の旧バージョンは移行チェーンを通して現行へ変換しなければならない（SHALL）。

#### Scenario: 旧バージョンのロード
- **WHEN** v1のセーブを現行エンジンでロードする
- **THEN** 移行が実行され、現行形式として読み込まれる

### Requirement: 不正セーブの拒否
セーブデータは復元前に整合検証（checksum・範囲・参照）を受け（SHALL）、違反データは適用せず理由を表示して拒否しなければならない（SHALL）。

#### Scenario: 改ざんセーブの拒否
- **WHEN** 在庫に負値を書き込まれたセーブをロードする
- **THEN** ロードは拒否され、違反箇所が表示される

### Requirement: 自動セーブとエクスポート
自動セーブを毎ゲーム月に行い（SHALL）、セーブのファイルエクスポート/インポートを提供しなければならない（SHALL）。

#### Scenario: エクスポート
- **WHEN** ユーザーがセーブをエクスポートする
- **THEN** .orbisファイルが生成され、別環境でインポート可能である
