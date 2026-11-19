# diplomacy-system 仕様

## Purpose
国家間関係（多要素モデル）、条約、宣戦・停戦・講和を管理する。好感度単独ではなく国家利益・地理・経済依存・思想・脅威に基づく評価を提供する。

## Scope
### 責務
- 関係値の計算（意思距離・脅威認知（影響力マップ）・経済相互依存・共通脅威・履歴・領土紛争）
- 条約のライフサイクル（不可侵・同盟・経済同盟・貿易協定・通行権・保障・制裁・禁輸・共同研究）
- 宣戦（CB要件・ペナルティ）、停戦、講和（貢献度スコアによる要求配分）、領土割譲、傀儡化・独立承認
- 国際機関（シナリオ定義、Phase 4）の投票・制裁決議

### 非責務
- 戦争の軍事処理（combat-system）
- 領土の変更適用（province-system へのコマンド発行のみ）
- AIの提案判断（ai-system が本システムの評価APIを使う）

## Data Model
docs/07 §2.4。War {participants, startTick, casusBelli, warScore, status}、Treaty {type, parties, expiry, terms}、Claim、RelationEntry（減衰する履歴）。

## State & Transitions
- 戦争: `declared → fighting → ceasefire | peace(white/victory/concession) → ended`
- 条約: `proposed → accepted → active → (expired | breached | annulled)`。宣戦時に互いの不可侵条約は自動解除。

## Calculation Rules
- `relation = baseline + w1×思想距離 − w2×脅威認知 + w3×経済相互依存 + w4×共通脅威 + w5×履歴(減衰) − w6×領土紛争`。各係数はシナリオ定義。
- 脅威認知は影響力マップ（相手軍事力 × 国境近接度）。
- 講和の要求配分 = 戦争貢献度スコア × 占領現状の妥当性チェック（Phase 4 で会議UI）。

## Invariants
- 同一ペアに相互矛盾する条約（戦争中の同盟存続等）は存在しない。
- 宣戦はCBまたはペナルティのいずれかを必ず伴う（CBなし宣戦は安定度・影響力・支持率への大幅ペナルティ）。

## Use Cases
- 大国が小国を脅威認知（国境集中）し、思想距離が大きい → 同盟が成立しにくい。
- 制裁発動 → 貿易ペア遮断（economy-system への通知）。

## Anomalies & Error Handling
- 矛盾する条約の提案は検証で却下。
- 参戦国消滅時は戦争から自動脱退し、残存参加者で継続。

## Dependencies
- 依存先: country-system、military/combat（戦争状態・貢献）、economy-system（相互依存・制裁適用）。
- 依存元: ai-system、event-system、game-ui（外交パネル・講和会議）。

## Security & Performance
- 関係値計算は週次（国ペアのうち「国境接続・条約・戦争関与」のみを全計算、其余は近似）。
- ティアL（250国）のペア数は ~31k。影響力マップで絞り込む。

## Acceptance & Tests
- 条約の矛盾検知テスト（戦争中の不可侵解除強制等）。
- 関係値のトレース表示テスト。CB要件のテスト。

## Requirements

### Requirement: 多要素の関係値
関係値は好感度単独ではなく、思想距離・脅威認知・経済相互依存・共通脅威・履歴・領土紛争の構成要素から計算され（SHALL）、各要素のトレースを要求可能でなければならない（SHALL）。

#### Scenario: 脅威認知の表示
- **WHEN** UIが関係値のトレースを要求する
- **THEN** 脅威認知（影響力マップ由来の値）とその他contributorsが返る

### Requirement: 条約の状態機械
条約は状態遷移（提案→承認→有効→期限切れ/破棄）を持ち（SHALL）、矛盾する状態（戦争中の同盟存続等）を許容してはならない（SHALL NOT）。

#### Scenario: 宣戦による条約解除
- **WHEN** 不可侵条約を結んだ国に宣戦する
- **THEN** 条約は自動で解除され、戦争が開始される

### Requirement: 宣戦のCB要件
宣戦には開戦理由（CB）またはCBなしのペナルティのいずれかを必ず伴い（SHALL）、CBなしの宣戦は安定度・外交的影響力・戦争支持率に大幅ペナルティを与えなければならない（SHALL）。

#### Scenario: CBなし宣戦
- **WHEN** プレイヤーがCBなしで宣戦する
- **THEN** 宣戦は成立するが、安定度と影響力が大きく低下する（トレースで確認可能）

### Requirement: 講和の貢献度スコア
講和における領土要求の配分は戦争貢献度スコアに基づき（SHALL）、現状（占領）と整合しない要求は講和会議（Phase 4）で妥当性警告を表示しなければならない（SHALL）。

#### Scenario: 貢献度の配分
- **WHEN** 停戦に至り講和が行われる
- **THEN** 占領現状ラインが基準となり、貢献度で追加要求が配分される
