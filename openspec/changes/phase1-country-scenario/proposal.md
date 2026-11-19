# Proposal

## Why
プレイヤーがシナリオと国家を選んでゲームを開始するまでの道筋を作る必要がある。データ駆動パックのロードは全コンテンツ（財・技術・イベント）の入り口であり、ここで検証を固めることで後続のコンテンツ追加が安全になる（MOD・不正データ処理の要求、QA観点）。

## What Changes
- `src/engine/scenario/` にパックロードフロー（manifest/スキーマ/参照整合/checksum → 検証 → 初期状態構築）を実装する
- `src/engine/country/` にCountryStore（名称・色・首都・政体・国庫・安定度等）と初期化を実装する
- 現代東アジアパック（5国家・~120州・World Bank 2023の初期統計）をリポジトリに同梱する
- シナリオ/国家選択画面用のデータAPI（パック一覧・国家一覧・開始状況）を提供する
- 検証器の共通モジュールを save-system 用に分離して配置する（Change 6で再利用）

## Capabilities
### Modified Capabilities
- `country-system`: 国家定義読込と最小指標の機能要件を追加
- `scenario-system`: ロードフロー・選択データAPI・パック同梱の機能要件を追加

## Impact
- **対象Phase**: 1 の 3/7
- **後続依存**: military（Change 4）は国家・戦争状態を、ai（Change 5）は国家リストを利用する
- **リスク**: R-11（ライセンス）: World Bankデータの帰属文をSOURCES.jsonに必ず含める。R-19（総和不整合）はロード時検証で捕捉
