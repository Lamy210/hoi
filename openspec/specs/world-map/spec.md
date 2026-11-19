# world-map 仕様

## Purpose
世界地図をゲームの中心的インターフェースとして描画・操作する能力。プロヴィンスのジオメトリ表示、表示モード切替、選択・ホバー、LODを提供する。具体的な描画ライブラリは抽象化の背後に隠す。

## Scope
### 責務
- MapRenderer 抽象インターフェースの定義（fill/border/picking/labels/overlay）
- 表示モード（15モード）のデータ駆動定義と切替
- プロヴィンスのホバー・選択インタラクション
- LOD（ジオメトリ簡略度の切替）と差分再描画（dirty プロヴィンスのみ）

### 非責務
- プロヴィンスの状態保持（province-system）
- 値の計算（各ドメイン；world-mapは値を受け取り配色するのみ）
- ユニットシンボルのゲームロジック（描画のみ）

## Data Model
- MapRenderer: `{ load(geometry), setColor(provinceId, color), setPattern, highlight(ids), pick(x,y) → ProvinceId, setOverlay(type,data) }`
- mapModes: `{mode, valueField, colorScale, overlay, patternRule}`（シナリオ/MOD定義可）
- ジオメトリはパイプライン生成の三角分割済みバイナリ＋GeoJSON（MapLibre用）

## State & Transitions
- モード: `political ⇄ terrain ⇄ …`（切替は全プロヴィンス再配色の1回のコスト）
- dirty: 変更されたプロヴィンス集合 → 次フレームで差分再配色

## Calculation Rules
- 色スケールはモード定義に従い、UI側の計算をしない（値はエンジン由来）。
- ピッキングはライブラリ機能（feature-state）または色IDレンダーターゲット（後期実装）を利用。

## Invariants
- 同一フレーム内の配色は単一の状態ハッシュから決定され、描画は状態の関数である（決定論表示）。

## Use Cases
- プレイヤーが「補給」モードに切替 → ボトルネックが警告色＋パターンで表示。
- プロヴィンスをクリック → 右パネルに詳細＋トレースリンク。

## Anomalies & Error Handling
- ジオメトリ読込失敗（checksum不一致・不正形式）はシナリオロード失敗として扱い、理由を表示。
- ピッキング対象外（海・無主地）は無効値を返す。

## Dependencies
- 依存先: province-system（ID・状態値）、game-ui（レイアウト）。
- 依存元: game-ui のメイン画面。

## Security & Performance
- ジオメトリデータはシナリオパック由来のみ（外部URL禁止）。
- ティアSで60fps、ティアLで実測（docs/13）。「20,000プロヴィンスでの性能」は実測前には保証しない。

## Acceptance & Tests
- 政治モード・地形モードの配色テスト（スナップショット比較）。
- 選択・ホバーのE2Eテスト。LOD切替でジオメトリが切替わることのテスト。

## Requirements

### Requirement: レンダラ抽象化
world-mapは MapRenderer 抽象インターフェースを提供し、具体的な描画ライブラリに依存する実装はこのインターフェースの背後に置かなければならない（SHALL）。

#### Scenario: 実装の切替可能性
- **WHEN** 別のMapRenderer実装を登録する
- **THEN** 表示モード・選択・差分再描画のAPI契約は同一のまま動作する

### Requirement: 表示モード切替
地図はデータ駆動定義された複数の表示モード（政治・地形を含む）を切り替えられなければならず（SHALL）、各モードの配色はパターン/アイコンによる冗長化を持たなければならない（SHALL）。

#### Scenario: モード切替
- **WHEN** プレイヤーが政治モードから補給モードへ切り替える
- **THEN** 全プロヴィンスが補給効率に基づく配色＋警告パターンで再表示される

### Requirement: 差分再描画
配色変更は dirty なプロヴィンスのみに適用しなければならず（SHALL）、状態変更のないフレームで全プロヴィンスを再配色してはならない（SHALL NOT）。

#### Scenario: 1州の占領
- **WHEN** 1つのプロヴィンスのcontrollerが変化する
- **THEN** 次フレームで再配色されるのはそのプロヴィンスのみである

### Requirement: LOD切替
地図はズーム帯に応じて簡略度の異なるジオメトリを切り替えなければならない（SHALL）。切替時は同一プロヴィンス境界の集合を維持しなければならない（SHALL）。

#### Scenario: ズームアウト
- **WHEN** プレイヤーが広域ズームへ移行する
- **THEN** 簡略化ジオメトリに切替わり、プロヴィンス数とIDは変化しない
