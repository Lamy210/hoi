# scenario-system 仕様

## Purpose
シナリオパック（地図・国家・財・産業・技術・イベント・統計・ローカライズ）の読み込み、検証、初期状態の構築を担う。エンジンをコンテンツ非依存にする中核。

## Scope
### 責務
- パックの構造検証（manifest・schema・参照整合・checksum）
- ジオメトリ・隣接・統計の整合検証（data-pipelineの検証を再確認）
- 文字列キー（財・産業・技術等）→数値インデックスの解決
- 初期状態（開始日・シード・国家・所有関係・統計値）の構築

### 非責務
- パックの生成・収集（data-pipeline）
- MODの競合解決（mod-system）
- 検証器の実装本体（save-system配下の共通バリデータを利用）

## Data Model
docs/07 §3 のパック構造。manifest.yaml（名前・バージョン・依存・互換エンジン版）、SOURCES.json、checksums.json。統計は正規化スキーマ＋quality_flag（real/estimated/balanced）。

## State & Transitions
- ロード: `loading → validating → built | failed(reason)`。failedは理由一覧をUIに返す。

## Calculation Rules
- 財の出現制御: 財はシナリオデータに存在する場合のみ市場に存在する（INV-7）。時代ごとの出現は「シナリオが財リストを定義する」ことのみで表現し、エンジンは年を見て財を出現させない。
- 統計の欠損: quality_flag と欠損ポリシー（真の欠損とゼロの区別）に従う。

## Invariants
- パック内のID参照は全て解決可能（未知キーは拒否）。
- ロード後の状態は docs/16 のシナリオ整合チェック（人口総和・所有一意性）を通る。

## Use Cases
- プレイヤーがシナリオ選択画面でパックを選び、国家を選んでゲーム開始。
- MODがベースパックを継承して財を追加（mod-system経由）。

## Anomalies & Error Handling
- 検証失敗は全違反を収集して一覧表示（最初の1件で中断しない）。
- checksum不一致は「破損/改ざん」として拒否。

## Dependencies
- 依存先: game-core（ストア初期化）、province/country-system、mod-system（パックの列挙・オーバレイ）。
- 依存元: game-ui（シナリオ選択）、data-pipeline（生成物）。

## Security & Performance
- パックサイズ上限（ティアS: 50MB、ティアL: 500MB、超過は警告）。
- パースはWorker内。メインスレッドをブロックしない。

## Acceptance & Tests
- 不正パック（非対称隣接・未知キー・checksum不一致）の拒否テスト一式。
- 現代東アジア・架空テラノヴァの2パックがロードできること（統合テスト）。

## Requirements

### Requirement: シナリオパックの検証付きロード
scenario-systemはパックのmanifest・スキーマ・参照整合・checksumを検証し、違反をすべて収集して表示した上でロードを拒否しなければならない（SHALL）。

#### Scenario: 未知の財キー
- **WHEN** 建物定義が未定義の財キーを参照する
- **THEN** ロードは失敗し、未知キーの一覧が表示される

### Requirement: 財の出現はシナリオ定義による
財・産業・技術の存在はシナリオパックのデータのみで決まり（SHALL）、エンジンが時代に応じて財を出現させてはならない（SHALL NOT）。

#### Scenario: 1936シナリオに半導体が出ない
- **WHEN** 1936年開始シナリオのパックをロードする
- **THEN** 半導体財は市場に存在せず、関連産業は定義されない

### Requirement: 初期状態の構築
scenario-systemは開始日・シード・国家・所有・統計から、セーブ直後に相当する完全な初期状態を構築しなければならない（SHALL）。構築結果はセーブ形式と同一の整合検証を通らなければならない（SHALL）。

#### Scenario: ロード直後の整合
- **WHEN** シナリオをロードして状態ハッシュを取る
- **THEN** 同一パック・同一シードでは常に同一ハッシュになる
