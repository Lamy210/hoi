# combat-system 仕様

## Purpose
プロヴィンス単位の戦闘解決を担う。地形・天候・装備・補給・指揮官・士気・航空支援（Phase 4）を係数として考慮し、決定論的に損耗を計算する。

## Scope
### 責務
- プロヴィンスバトルの開始・継続・終結
- 日次の損耗計算（組織率・人力・装備）と撤退・包囲・降伏処理
- 占領完了判定（14日ルール）とmilitary-systemへの発火
- 戦争スコアへの貢献記録

### 非責務
- 移動・撤退先の決定（military-systemが実行）
- 補給効率の計算（logistics-system から供給）
- 講和・停戦の交渉（diplomacy-system）
- 戦争状態の保持（diplomacy-system が保持、本システムは参照）

## Data Model
- Battle: `{provinceId, attackers[], defenders[], startTick, dailyLog}`。前面幅は地形別（plains 10 / hills 6 / mountains 4 / urban 5）。

## State & Transitions
- バトル: `engaged → (attackerRetreat | defenderRetreat | attackerVictory | stalemate) → closed`

## Calculation Rules
- 日次損耗 = `f(火力比, 地形係数, 天候, 補給効率, 指揮官スキル, 士気, 装備品質, 航空支援, 決定論ロール)`
- 撤退: org < 20% で強制撤退（味方支配の隣接へ）。撤退先が無い場合は包囲扱いへ。
- 包囲: 補給効率0 → org回復不能＋日次崩壊損耗 → 一定期間後に降伏（全損）。
- 決定論ロールは PCG32 子ストリーム（stream = hash(seed, "combat", battleId)）。

## Invariants
- 同一入力（状態・シード）で同一損耗（ゴールデンテスト対象）。
- バトルは1プロヴィンスに最大1。攻守の所属はそのtickのcontroller/開戦状態から導出。

## Use Cases
- 攻勢の師団が防衛師団と交戦 → 日次で双方が損耗 → 防衛側撤退 → 占領タイマ開始。
- 山岳防衛が前面幅4で少数精鋭を活かし、多数側は予備に回る。

## Anomalies & Error Handling
- 参加師団0のバトルは即時終結。
- 双方同時撤退の同tick解決は決定論的優先順位（ID順）で処理。

## Dependencies
- 依存先: military-system（師団状態）、logistics-system（補給）、province-system（地形・controller）、research-system（装備品質）、population-system（指揮官・経験はcountry経由）。
- 依存元: diplomacy-system（停戦で全バトル閉鎖）、game-ui（戦争状況）。

## Security & Performance
- 戦闘係数の全contributorsがトレース可能（計算根拠の開示要件）。
- 戦闘関与のない国家・ユニットはdaily処理をスキップ（更新制御）。

## Acceptance & Tests
- ゴールデンテスト（同一入力→同一損耗）。
- 地形係数・補給0の境界テスト。撤退・包囲の状態遷移テスト。

## Requirements

### Requirement: 戦闘解決の決定論性
戦闘の損耗計算はシード派生ストリームを用い（SHALL）、同一の状態・シードに対して同一結果を返さなければならない（SHALL）。

#### Scenario: 同一バトルの再現
- **WHEN** 同一状態・同一シードでバトルを再解決する
- **THEN** 日次の損耗列が完全一致する

### Requirement: 戦闘係数のトレース
戦闘力の計算には地形・補給・装備・指揮官・士気等の係数がcontributorsとして含まれ（SHALL）、UIが要求時に取得できる（SHALL）。

#### Scenario: 山岳防衛の係数表示
- **WHEN** 山岳プロヴィンスの防衛側戦闘力トレースを要求する
- **THEN** 地形係数の値と式がcontributorsに含まれる

### Requirement: 撤退と包囲
組織率が閾値（20%）を下回った側は味方支配の隣接プロヴィンスへ強制撤退し（SHALL）、撤退先が存在しない場合または補給が完全に遮断された場合は包囲状態として崩壊損耗の対象とならなければならない（SHALL）。

#### Scenario: 包囲による降伏
- **WHEN** 師団の補給が遮断され崩壊期間が経過する
- **THEN** 師団は降伏（全損）し、参加バトルから除去される
