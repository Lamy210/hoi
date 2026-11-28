## ADDED Requirements

### Requirement: 占領入力の有限性
占領率・抵抗・順応・駐屯補給は有限かつ定義域内でなければならない（SHALL）。

#### Scenario: 占領率または抵抗がNaNである
- **WHEN** 占領率または抵抗がNaNである
- **THEN** Tick開始前に拒否し入力状態を変更しない

### Requirement: 占領資産と駐屯の排他
占領資産と駐屯人員・装備は実在量を超えて割当してはならない（MUST NOT）。

#### Scenario: 州の支配国が変わる
- **WHEN** 州の支配国が変わる
- **THEN** 操業権を更新し旧国の二重徴収を停止する
