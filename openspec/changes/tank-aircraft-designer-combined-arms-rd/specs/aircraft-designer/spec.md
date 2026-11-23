## ADDED Requirements

### Requirement: 機体・エンジン出力・武装・搭載量の互換を検証する
機体設計はsmall/medium/largeフレーム、エンジン基数とレシプロ/ジェット、機関銃・機関砲・爆弾倉・魚雷・ロケット、増槽・防弾タンク・レーダー・急降下ブレーキを選べなければならない（SHALL）。重量・推力・ペイロード・スロット数・研究技術を検証し、離陸出力が足りない構成を拒否しなければならない（MUST）。

#### Scenario: レーダー付き増槽戦闘機
- **WHEN** small機体にレシプロ単発・機関砲・レーダー・増槽を選ぶ
- **THEN** 設計プレビューは約461km/h、航続約894km、AirAttack18、信頼性88%、IC18.0を示す

#### Scenario: エンジン出力不足
- **WHEN** Thrust/(12×TotalMass) が1.0未満の過積載機体を確定する
- **THEN** 設計を拒否し、未製造機体と搭乗員・燃料の在庫を増減させない

### Requirement: 任務適性を装備能力により制約する
戦闘機、CAS、戦略爆撃、雷撃任務は武装モジュールから導出したAirAttack/GroundAttack/StrategicBomb/NavalAttackを使わなければならない（SHALL）。対象能力がゼロの型番は当該任務を開始してはならない（MUST NOT）。

#### Scenario: 機関銃だけの戦闘機
- **WHEN** StrategicBomb=0の設計に戦略爆撃任務を割り当てる
- **THEN** 任務を拒否し、出撃機数0・燃料消費0となる
