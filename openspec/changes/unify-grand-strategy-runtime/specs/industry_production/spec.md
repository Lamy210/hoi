## ADDED Requirements

### Requirement: 物理能力と資金の排他配分
民需工場の建設・修理・民生品の能力合計は実稼働ICを超えてはならない（MUST NOT）。

#### Scenario: 資材が不足する
- **WHEN** 資材が不足する
- **THEN** 未実行分のICと予算は他用途へ再配分できる

### Requirement: 製造仕掛品と効率
仕掛品を型番別に記録し、資材不足の空き能力を無制限に繰り越してはならない（MUST NOT）。

#### Scenario: 別型番へ生産切替する
- **WHEN** 別型番へ生産切替する
- **THEN** 共通部品に応じ効率のみを継承する
