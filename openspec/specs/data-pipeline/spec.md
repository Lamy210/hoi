# data-pipeline 仕様

## Purpose
オープンデータの取得・検証・正規化・シナリオパック生成を担うビルド時パイプライン。ゲーム実行時の外部API依存を排除する。

## Scope
### 責務
- 取得ジョブ（URL・取得日時・ソースバージョンの記録・生ファイルのアーカイブ）
- 検証（面積整合・トポロジ・人口総和・年代・ID突合・欠損ポリシー）
- 正規化（共通スキーマ `{entity_id, year, indicator_key, value, unit, quality_flag, source_id, source_version}`）
- ジオメトリ処理（簡略化 → earcut三角分割 → LOD生成）
- パック生成（manifest・SOURCES.json（完成済み帰属文）・checksums）

### 非責務
- ランタイムでのデータ読込（scenario-system）
- ライセンス判断の自動化（SOURCES.jsonへの記録は手動レビューを含む）
- ゲーム内での統計の意味づけ（シナリオ定義）

## Data Model
docs/07 §3。正規化スキーマの `quality_flag ∈ {real, estimated, balanced}`（現実統計・推定・バランス調整の区分）。

## State & Transitions
- パイプライン: `fetch → validate → normalize → transform → package → publish`。各段階の合格記録をパックに同梱。

## Calculation Rules
- 面積計算は等面積投影。人口総和は「ADM1合計 ≈ 国人口、±10%超はアラート」。
- 境界と統計年の対応はメタデータで明記（現勢境界 × 過去値の組合せを明示）。

## Invariants
- パックは immutable（同名での差し替え禁止、バージョンアップのみ）。
- ランタイムは外部APIを呼ばない（同梱のみ）。

## Use Cases
- 現代東アジアMVPパックの生成（NE 10m admin-1 クリップ＋World Bank 2023）。
- 1936シナリオ用にMaddison＋推定値（estimated）でパック生成。

## Anomalies & Error Handling
- 取得失敗は再試行後、明示的な「欠損」として記録（黙って古いデータを使わない）。
- 検証失敗はパック生成を中断し、違反一覧を出力。

## Dependencies
- 依存先: なし（ビルド時ツール群）。
- 依存元: scenario-system（生成物）、mod-system（MOD作成支援）。

## Security & Performance
- 取得先はdocs/12の許可リストのみ。API制限（GeoNames credits等）の遵守。
- ジオメトリ処理はNode上で実行（ランタイムに持ち込まない）。

## Acceptance & Tests
- 現代東アジアパックが検証全項目を通ることの統合テスト。
- 帰属文の網羅性テスト（使用全ソースがSOURCES.jsonに存在）。

## Requirements

### Requirement: 出典メタデータの必須化
生成するパックは、使用した全データソースの名前・バージョン・取得日・ライセンス・帰属文を含む SOURCES.json を必ず同梱しなければならない（SHALL）。

#### Scenario: 帰属の網羅
- **WHEN** パックがNatural EarthとWorld Bankのデータを使用する
- **THEN** SOURCES.json に両者のライセンスとクレジット画面用の完成済み帰属文が存在する

### Requirement: 品質フラグの区分
統計値は quality_flag（real / estimated / balanced）を持たなければならず（SHALL）、現実統計・推定・バランス調整値を混在させてはならない（SHALL NOT）（同一指標内でも区別が保持される）。

#### Scenario: 推定値の表示
- **WHEN** UIがquality_flag=estimatedの指標を表示する
- **THEN** 「推定値」であることが出典情報とともに確認できる

### Requirement: ランタイム外部依存の排除
パイプラインの成果物はゲームに同梱され（SHALL）、ゲーム実行中に外部APIを呼び出すデータ経路を生んではならない（SHALL NOT）。

#### Scenario: オフライン起動
- **WHEN** ネットワーク切断状態でシナリオをロードする
- **THEN** パックは完全にローカルから読み込まれ、ロードが成功する
