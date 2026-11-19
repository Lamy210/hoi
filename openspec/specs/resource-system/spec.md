# resource-system 仕様

## Purpose
財（資源・商品）のカタログ定義と資源産出（deposit）の管理を担う。財リストは完全にシナリオデータ駆動であり、エンジンは財の意味を知らない。

## Scope
### 責務
- 財定義（key・単位・基準価格・カテゴリ・時代タグ）のスキーマと検証
- プロヴィンスの資源産出（deposits）の保持と参照
- 財インデックスの割当と解決（ロード時）

### 非責務
- 価格・需給（economy-system）
- 生産方法（production-system）
- 貿易（economy-system）
- 資源の損壊処理（province-system の infra/buildings と連携して economy が反映）

## Data Model
- Good: `{key, unit, basePrice, category, era?}`（eraはシナリオ側の整理用タグで、出現制御はシナリオの財リスト自体で行う）
- deposits: `provinceId → {goodIdx: 産出量}`（シナリオデータ）

## State & Transitions
- 財集合はロード時確定（ゲーム中の追加はMOD再ロードのみ）。depositは資源枯渇イベント（Phase 4）でのみ変化。

## Calculation Rules
- 資源の実産出は「deposit × 開発度（鉱山レベル）× 稼働率」であり、production-system が計算する（本システムは定義と基礎値のみ）。

## Invariants
- 全財キーは一意。全depositの財キーは財集合に存在。
- 財の負在庫は存在しない（economy-system と共通、INV-4）。

## Use Cases
- 1936シナリオは「石油・石炭・鉄鉱石・鋼鉄…」のみを定義し、半導体は存在しない。
- MODが新財（例: 「クリプトン」）を追加し、既存産業の投入に登録する。

## Anomalies & Error Handling
- 未知の財キー参照（deposits・産業投入等）はロード拒否。
- 基準価格 ≤0 は拒否。

## Dependencies
- 依存先: game-core（ストア）、scenario-system（定義ソース）。
- 依存元: economy / production / construction / military（装備財）。

## Security & Performance
- 財数の上限は1,000（ティアL想定）。超過は警告。
- 財インデックスは配列アクセスで参照（文字列比較をホットパスに持ち込まない）。

## Acceptance & Tests
- 財キー一意性・参照整合の検証テスト。
- 2パック（現代・架空）で財集合が異なり、どちらもロードできること。

## Requirements

### Requirement: シナリオ駆動の財定義
財の集合はシナリオパックによって完全に定義され（SHALL）、エンジンに財のハードコードが存在してはならない（SHALL NOT）。

#### Scenario: MODによる財追加
- **WHEN** MODが新財を定義し、既存産業の投入として参照する
- **THEN** ロード時のインデックス解決が成功し、市場で取引可能になる

### Requirement: 資源産出の基礎値
resource-systemはプロヴィンスごとの資源産出基礎値（deposit）を保持し、負の産出値を拒否しなければならない（SHALL）。

#### Scenario: 負の産出値
- **WHEN** パックが負のdeposit値を含む
- **THEN** ロードは拒否され、違反箇所が表示される
