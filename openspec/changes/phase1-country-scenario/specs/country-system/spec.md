# Spec Delta

## ADDED Requirements

### Requirement: 国家定義の読込と国庫初期化
パックの国家定義から CountryStore を構築し（SHALL）、首都を持たない国家定義は拒否しなければならない（SHALL）。国庫の初期値はシナリオデータから設定される（SHALL）。

#### Scenario: 首都不在の拒否
- **WHEN** パックの国家定義にcapitalがない
- **THEN** ロードは拒否され、該当国家が表示される

### Requirement: 国家概要の最小指標
国家は政体・国庫・安定度・支持率の初期値を持ち（SHALL）、各値はトレース（contributors）を要求可能でなければならない（SHALL）。

#### Scenario: 安定度の初期表示
- **WHEN** ゲーム開始直後に国家概要を開く
- **THEN** 政体・国庫・安定度・支持率が表示され、トレースで構成要素が確認できる
