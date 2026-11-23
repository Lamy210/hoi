# Military system — atomic named formations

## ADDED Requirements

### Requirement: 連番の省略可能な自動名称
軍団・軍集団作成コマンドの`name`を省略した場合、当該国の既存名称集合と衝突しない最低の正整数で連番名を生成しなければならない（SHALL）。nameが指定されている従来コマンドの挙動は維持しなければならない（SHALL）。

#### Scenario: 既存連番の次
- **WHEN** 同じ国に軍団1、軍団2が存在し、name省略で軍団を追加する
- **THEN** 新しい名前は軍団3になる

### Requirement: 作成と所属登録の原子性
任意の`unitIds`/`armyIds`を伴う軍団・軍集団作成は、所有権、存在、ユニーク数、上限をすべて検証してから一括変更しなければならない（SHALL）。失敗時は作成数・カウンタ・所属を変更してはならない（SHALL NOT）。

#### Scenario: 外国師団が混じる
- **WHEN** 自国と他国の師団をまとめて軍団作成に指定する
- **THEN** コマンドが拒否され、軍団も師団所属も一切変更されない

### Requirement: 名称変更は所有者だけ
`renameFormation`はプレイヤー所有権、フォーメーション種別、対象ID、`validName`を検証してから変更しなければならない（SHALL）。

#### Scenario: 他国の軍団を指定する
- **WHEN** 自国に属さない軍団の名前を変更しようとする
- **THEN** コマンドが拒否される
