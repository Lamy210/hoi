# logistics-system 仕様

## Purpose
兵站をゲームの主要な戦略要素として扱う。補給拠点から部隊への供給効率を計算し、補給不足が移動・戦闘・士気・装備損耗に波及する効果を提供する。

## Scope
### 責務
- 補給グラフ（首都・ハブ・港湾をノード、隣接をエッジ）の構築
- MVP: ソースからの到達性（Dijkstra距離）＋距離減衰による supplyEff 計算
- 拡張（Phase 3+）: 輸送容量・優先度つきフローへの置換（同じAPI契約で）
- グラフ再計算のdirty管理（占領・損壊・講和で再計算）

### 非責務
- 補給財（燃料・弾薬・食料）の生産（economy/production-system）
- 部隊への適用（military/combat-system が消費）
- 輸送船団の個別シミュレーション（Phase 4、抽象輸送容量で代替）

## Data Model
docs/07 §2.5。`nodes {provinceId, capacity, isSource}`、`distFromSource`、`supplyEff[province][country]`。

## State & Transitions
- グラフ: `built → dirty(損壊・占領・講和) → rebuilt`。再計算は週次＋dirtyイベント駆動。

## Calculation Rules
- MVP: `supplyEff = clamp(capacityFactor × max(0, 1 − dist/radius), 0, 1)`。capacityFactor = ハブ容量/要求量。
- 効果の適用は消費側仕様に記載: org回復 `×(0.2+0.8s)`、戦闘力 `×(1−0.5(1−s))`、移動 `×(0.5+0.5s)`、`s<0.5` で装備損耗。
- Phase 3+: 最大流量問題（優先度=部隊の重要度順）に置換。距離減衰は流量の損耗として表現。

## Invariants
- supplyEff ∈ [0,1]。補給ソースに到達不能な部隊は supplyEff = 0。
- 再計算は決定論的（同状態→同距離）。

## Use Cases
- 鉄道の隘路が1プロヴィンスで占領される → 下流の大軍集団の補給が0 → 包囲崩壊のカウント開始（地図「補給」モードで可視化）。
- 港湾占領で海上補給線が断たれ、沿岸軍の効率が低下。

## Anomalies & Error Handling
- 首都喪失: ソースが失われた国家は全領土で供給低下（首都回復まで）。国家消滅時は供給0。
- 自己ループ・非対称グラフはprovince-systemで排除済み（二重防御）。

## Dependencies
- 依存先: province-system（隣接・infra・controller）、country-system（首都）。
- 依存元: military / combat / game-ui（補給モード）。

## Security & Performance
- ティアL: 20k州 × 250国の全ペア計算は行わない。「戦争関与国家×戦線近傍のみ」に制限（更新制御）。
- Dijkstraは週次＋dirty駆動。性能は実測（docs/13）で確認。

## Acceptance & Tests
- 遮断シナリオテスト（1プロヴィンス占領→下流効率0→崩壊時間の計測）。
- 距離減衰の境界テスト（radius内外）。

## Requirements

### Requirement: 補給効率の計算
logistics-systemは補給ソースからのグラフ距離とハブ容量から、各プロヴィンス・各国の supplyEff ∈ [0,1] を決定論的に計算しなければならない（SHALL）。

#### Scenario: 距離による減衰
- **WHEN** 部隊が補給半径を超える位置に配置される
- **THEN** supplyEff は0になり、消費側（org回復・戦闘力）に補給不足が適用される

### Requirement: 補給網の遮断
占領・損壊により補給経路が分断された場合、該当領域のsupplyEffは次の再計算で低下しなければならず（SHALL）、分断された領域は包囲状態の対象とならなければならない（SHALL）。

#### Scenario: 1州の占領で遮断
- **WHEN** 隘路プロヴィンスが占領される
- **THEN** dirty再計算で下流のsupplyEffが0になり、包囲崩壊処理が開始される

### Requirement: MVPと拡張モデルの互換
supplyEff の算出方式（到達性＋減衰 → 容量つきフロー）を入れ替えても、消費側（military/combat）のAPI契約と効果式は変更されない構造でなければならない（SHALL）。

#### Scenario: フローモデルへの置換
- **WHEN** Phase 3の容量フロー実装に切替える
- **THEN** military/combat-system のコードは変更なしで同一の効果を得る
