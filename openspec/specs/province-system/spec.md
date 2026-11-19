# province-system 仕様

## Purpose
最小空間単位であるプロヴィンス（州・都市・地形・資源・人口集約の載せ台）の状態を管理する。所有（de jure）と実効支配（occupation）を分離して保持する。

## Scope
### 責務
- ProvinceStore（SoA）の保持: owner / controller / cores / terrain / infra / 人口集約 / 資源産出 / 建物 / 隣接
- 隣接グラフ（CSR）の構築と対称性保証
- 州（region）への集約計算
- 占領・割譲による owner / controller の変更API（コマンド経由のみ）

### 非責務
- 占領判定の発火（combat-system）・割譲の交渉（diplomacy-system）
- 人口の成長計算（population-system）
- 資源の市場価格（economy-system）
- 描画（world-map）

## Data Model
- `owner: u16[]`、`controller: u16[]`、`cores: 疎配列`、`terrainType: u8[]`、`infraLevel: u8[]`（0–5）
- `deposits: 疎行列(goodIdx→産出)`、`buildings: 疎行列(type→level)`（Phase 3）
- `adjacency: CSR {offsets, targets, baseCost}`。`regionId: u16[]`。`labelPoint`。

## State & Transitions
- controller: `国家A → 国家B`（占領/復帰/割譲コマンドのみ）
- owner: 講和・割譲コマンドでのみ変化。無主（0）は講和後の非国家化で可能。
- infraLevel: `0..5`、損壊イベントで低下、建設で回復。

## Calculation Rules
- 隣接コスト = `f(地理距離, infraLevel)`（詳細はlogistics-system）。
- 州集計: 人口・出力・VPの州合計はプロヴィンス値の純関数として導出。

## Invariants
- INV-1: owner は国家ID、controller は国家IDまたは無主。
- INV-5: 隣接グラフは対称（A→BがあればB→A）。
- 全プロヴィンスのowner集合は、存続する国家の領土として重複しない。

## Use Cases
- combat-systemが「占領完了」コマンドを発行 → controller が移転 → world-map がdirty化。
- population-system がプロヴィンス人口集約を参照。

## Anomalies & Error Handling
- シナリオロード時: 隣接の非対称・自己ループ・未知のowner参照はロード失敗（理由表示）。
- 首都喪失: 国家は存続するが国庫・補給ソースの移転処理は country-system / logistics-system に通知するイベントを発行。

## Dependencies
- 依存先: game-core（ストア・コマンド）、scenario-system（初期データ）。
- 依存元: world-map / logistics / military / economy / population。

## Security & Performance
- owner/controller への書込コマンドは combat/diplomacy のみが発行可能（コマンドレジストリの発行者制限）。
- 隣接取得はO(1)（CSR）。ティアL（20k州）でのグラフ再構築はdirty駆動のみ。

## Acceptance & Tests
- 隣接対称性のプロパティテスト（INV-5）。
- 占領→講和→割譲の一連の状態遷移テスト（INV-1の維持）。

## Requirements

### Requirement: 所有と支配の分離
province-systemは、領有国（owner）と実効支配国（controller）を別々のフィールドとして管理しなければならない（SHALL）。owner は講和・割譲コマンドでのみ変化し、controller は占領コマンドでのみ変化する（SHALL）。

#### Scenario: 戦時中の占領
- **WHEN** 国家Aが国家BのプロヴィンスPを占領する
- **THEN** PのownerはBのまま、controllerがAに変化する

### Requirement: 隣接グラフの整合
province-systemは隣接グラフを保持し、対称性（A→BがあればB→A）と自己ループ禁止を保証しなければならない（SHALL）。違反データはシナリオロード時に拒否される（SHALL）。

#### Scenario: 非対称シナリオの拒否
- **WHEN** シナリオパックが非対称な隣接関係を含む
- **THEN** ロードは失敗し、違反箇所（プロヴィンスIDペア）が表示される

### Requirement: 地形とインフラ
province-systemは地形種別（8種）とインフラレベル（0–5）を保持し、インフラ低下・回復はコマンド経由でのみ行われなければならない（SHALL）。

#### Scenario: インフラ損壊
- **WHEN** 損壊イベントがインフラを1低下させる
- **THEN** infraLevel が1減り、依存システム（補給・移動コスト）のdirty化が起きる
