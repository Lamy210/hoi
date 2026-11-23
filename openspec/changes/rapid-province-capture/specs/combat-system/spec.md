# Combat system — rapid province occupation

## MODIFIED Requirements

### Requirement: 守備軍不在の占領確定
交戦中の敵国支配州に味方の非包囲生存師団が到着し、戦闘解決後に守備師団が残っていない場合、占領は同じ日次処理で確定しなければならない (SHALL)。交戦していない国の州、攻撃師団不在の州、守備師団が残存する州は支配権を変えてはならない (SHALL NOT)。

#### Scenario: 無防備州へ入る
- **WHEN** 戦争中に味方の生存師団が無防備な敵州へ到着する
- **THEN** その日の処理でcontrollerを変更し、UI用の地図スナップショットも新しい支配国を返す

#### Scenario: 敵師団が防衛中
- **WHEN** 到着した攻撃師団と敵の防衛師団が同州にいる
- **THEN** 防衛軍が残存する限り支配権を変更しない

#### Scenario: 攻撃師団を失う
- **WHEN** 占領判定時に生存中の攻撃師団が1つもいない
- **THEN** 占領タイマをリセットし、支配権を変更しない

### Requirement: 領有と実効支配の区別
軍事占領時のcontroller変更はownerを変更してはならない (SHALL NOT)。

#### Scenario: 占領と講和の分離
- **WHEN** 無防備州の軍事占領が成立する
- **THEN** ownerは元の国のままで、controllerだけが進軍国へ変わる
