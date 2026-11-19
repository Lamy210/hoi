# Spec Delta

## ADDED Requirements

### Requirement: プロヴィンスストアの構築
パックのプロヴィンス定義からSoAストアを構築し（SHALL）、負面積・未知のowner参照を含むパックは拒否しなければならない（SHALL NOT）。

#### Scenario: 不正パックの拒否
- **WHEN** パックが未知のowner国IDを含む
- **THEN** ロードは拒否され、違反箇所が表示される

### Requirement: 隣接グラフの構築
パックの隣接定義からCSR隣接グラフを構築し（SHALL）、対称性・自己ループ禁止を検証しなければならない（SHALL）。

#### Scenario: 対称性検証
- **WHEN** 隣接定義がA→BのみでB→Aを欠く
- **THEN** ロードは拒否され、該当ペアが表示される

### Requirement: 地形・インフラの初期設定
パックから地形種別とインフラレベル（0–5）を設定し（SHALL）、範囲外の値は拒否しなければならない（SHALL）。

#### Scenario: インフラ範囲検査
- **WHEN** パックがinfraLevel=6を含む
- **THEN** ロードは拒否され、違反プロヴィンスが表示される
