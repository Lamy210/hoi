# construction-system 仕様

## Purpose
建物の建設・拡張・復旧（工期・コスト・資源消費）を管理する。プロヴィンス単位の建物レベルを変化させる唯一の経路。

## Scope
### 責務
- 建設キュー（国家単位）の管理と工期進行
- 建設コストの資源・資金消費（投入財の実消費）
- 損傷建物の復旧処理
- 建設完了時の建物レベル更新（province-store へのコマンド適用）

### 非責務
- 建物の生産（production-system）
- 建設の経済的許可判定（予算はeconomy/politicsの参照値）
- 損傷の付与（combat-system が付与し、本システムは復旧のみ）

## Data Model
- ConstructionProject: `{country, provinceId, buildingType, targetLevel, startTick, progress, consumedBudget}`
- 建設能力: 建設会社建物レベルの合計（並行プロジェクト数の上限）

## State & Transitions
- プロジェクト: `queued → building → completed | cancelled`。中止で未消費分は返却（返却率はシナリオ定義、既定80%）。

## Calculation Rules
- 工期 = `baseDays × targetLevel / 建設能力係数`（シナリオ定義）。
- コスト = `materialCost(goods) + fundsCost`。資金は国庫から、資材は市場購入。

## Invariants
- 建物レベルは 0 以上。未完の建設は効果を発揮しない。
- 並行プロジェクト数は建設能力を超えない。

## Use Cases
- プレイヤーが製鉄所レベル2を発注 → 資材購入 → 工期進行 → 完了でレベル更新。
- 爆撃でレベル1損傷 → 復旧プロジェクトを発注（費用は建設の一部）。

## Anomalies & Error Handling
- 資材不足: プロジェクトは待機（市場価格で高騰時は自動中断も選択可）。資金不足で自動中止。
- 中止時の返却は帳簿突合を通る（貨幣保存則、INV-2）。

## Dependencies
- 依存先: economy-system（資材・資金）、production-system（建物型）、province-system（レベル適用）。
- 依存元: game-ui（建設パネル）、ai-system（建設AI）。

## Security & Performance
- 建設コマンドの検証で「資源不正生成」を防ぐ（全消費が帳簿を通る）。
- 月次進行。プロジェクト数はティアLで数十万規模を許容（配列走査）。

## Acceptance & Tests
- 完了・中止・資材待機の状態遷移テスト。
- 復旧処理がレベルを超えて上げないことのテスト。

## Requirements

### Requirement: 建設コストの実消費
建設は資金と資材を実消費として行われ（SHALL）、未消費のコストで建物が完成してはならない（SHALL NOT）。

#### Scenario: 資材不足の待機
- **WHEN** 鋼鉄価格上昇で資材が調達できない
- **THEN** プロジェクトは待機状態になり、建物レベルは変化しない

### Requirement: 建物レベルの更新は一経路
建物レベルの変化は construction-system の完了・復旧コマンド経由のみで行われなければならない（SHALL）。

#### Scenario: 完了によるレベル更新
- **WHEN** 工期が完了する
- **THEN** 該当建物レベルが1上がり、production-systemの産出計算に反映される
