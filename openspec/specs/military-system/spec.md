# military-system 仕様

## Purpose
師団（陸軍部隊）の作成・移動・戦線割当・装備・人員の状態を管理する。過剰なマイクロマネジメントを避ける戦線指示（スタンス）を提供する。

## Scope
### 責務
- UnitStore（師団）の状態: 人力・装備・組織率・強度・経験・スタンス・位置・移動
- 移動の合法性検証（隣接・通過権・海越え禁止）と移動時間計算
- 戦線（front）への割当とスタンス（防衛/攻勢/撤退）管理
- 徴兵・訓練による師団作成（人力・装備の実消費）
- 占領完了コマンドの発行（判定はcombat-system）

### 非責務
- 戦闘解決（combat-system）
- 補給効率の計算（logistics-system；本システムは値を消費）
- 徴兵可能人口の計算（population-system）
- 海軍・空軍（Phase 4、別能力）

## Data Model
docs/07 §2.3。移動は「セグメント先頭プロヴィンス＋残距離」で表現（パスの毎tick再構築を避ける）。

## State & Transitions
- 師団: `mobilizing → deployed → (moving ⇄ holding) → retreating → destroyed`
- 戦線: `created → assigned(units) → dissolved`

## Calculation Rules
- 移動時間 = `エッジコスト / 移動速度 × 補給係数`（エッジコストはprovince-systemの隣接コスト）。
- 師団作成: 人力（徴兵プールから）＋装備（市場から）の実消費を要する。不足なら作成不可。
- 優先規則: 明示個別命令 > 戦線AI再配置。戦線AIは明示命令のある師団を再配置しない。

## Invariants
- 師団は常に単一プロヴィンス上に存在（移動中は両端の中間扱いで戦闘不参加）。
- 装備・人力は負にならない（INV-4）。敵地への直接移動は開戦状態でのみ許可。

## Use Cases
- プレイヤーが戦線に3個師団を割当て「攻勢」を指示 → 戦線AIが進路を計算。
- 包囲された師団が撤退不可 → combat-system の崩壊処理へ移行。

## Anomalies & Error Handling
- 不法移動（海越え・敵地直進）はコマンド検証で却下。
- 所属不明（プロヴィンス消滅等）はfail fast（あり得ない状態）。

## Dependencies
- 依存先: province-system（隣接・支配）、logistics-system（補給）、population-system（徴兵）、economy-system（装備購入）。
- 依存元: combat-system、ai-system、game-ui。

## Security & Performance
- 移動コマンドは全て検証（合法性）。AIのコマンドも同一検証を通る。
- ティアL（100kユニット）では移動中ユニットのみをdaily処理（更新制御、docs/08 §3）。

## Acceptance & Tests
- 移動合法性のテスト（海越え拒否・未開戦敵地拒否）。
- 作成コスト（人力・装備不足時の拒否）テスト。
- 戦線AIが明示命令を上書きしないことのテスト。

## Requirements

### Requirement: 師団作成の実消費
師団の作成は徴兵可能人力と装備財の実消費を要し（SHALL）、不足する場合作成されてはならない（SHALL NOT）。

#### Scenario: 人力不足の拒否
- **WHEN** 徴兵プールが師団1個分に満たない
- **THEN** 作成コマンドは却下され、理由がUIに表示される

### Requirement: 移動の合法性
移動コマンドは隣接プロヴィンス間・通過権・開戦状態を検証し（SHALL）、合法な経路のみ適用されなければならない（SHALL NOT）。海上移動は海軍能力（Phase 4）なしでは行えない。

#### Scenario: 海越えの拒否
- **WHEN** 陸続きでないプロヴィンスへ移動命令を出す
- **THEN** コマンドは却下される

### Requirement: 戦線指示と優先規則
military-systemは戦線への師団割当とスタンス指示を提供し（SHALL）、明示された個別命令は戦線AIによる再配置を上書きしなければならない（SHALL）。

#### Scenario: 明示命令の保護
- **WHEN** 師団が明示移動命令を持つ状態で戦線AIが思考する
- **THEN** 戦線AIは該当師団の命令を変更しない

### Requirement: 占領による支配移転
防衛軍不在の状態で攻撃側が一定期間（既定14日）支配したプロヴィンスは、占領コマンドによりcontrollerが攻撃側へ移転しなければならない（SHALL）。

#### Scenario: 占領完了
- **WHEN** 敵プロヴィンスを14日間支配する
- **THEN** controllerが攻撃側に変化し、地図表示と補給グラフが更新される
