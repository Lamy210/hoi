# Military system — atomic army group front assignment (delta)

## ADDED Requirements

### Requirement: 複数軍の異なる戦線への一括割当
軍集団の指揮UIは、配下の2軍以上について戦線を個別に選択し、単一コマンドで割り当てられなければならない (SHALL)。命令は軍の現行所属師団と戦線revisionを送信しなければならない (SHALL)。

#### Scenario: 複数軍への成功
- **WHEN** 同じ自軍軍集団に所属する2軍が、それぞれ合法な別戦線を指定する
- **THEN** すべての対象師団の戦線IDだけが一括更新され、手動固定・経路は変わらない

### Requirement: 部分適用の禁止と指揮系統の整合性
複数軍の一括命令は全件の所属・所有・生存・戦線revision・駐屯との排他・移動/戦闘/包囲状態を事前検証しなければならない (SHALL)。不正または古い項目が1つでもあれば、割当は全件拒否しなければならない (SHALL)。

#### Scenario: 古い軍所属一覧
- **WHEN** 指揮UIの所属師団一覧取得後、軍の所属が変更された
- **THEN** `staleFormation` で拒否し、いずれの師団の戦線IDも変更しない

#### Scenario: 古い戦線revision
- **WHEN** 指定したいずれかの戦線revisionが更新された
- **THEN** `staleFrontOrder` で拒否し、他軍の戦線所属も変更しない

#### Scenario: 駐屯または移動中の師団
- **WHEN** 指定した軍に駐屯中または移動/戦闘/包囲中の師団が含まれる
- **THEN** 全件を拒否し、明示命令・移動経路を上書きしない

#### Scenario: セーブ・ロードと再現性
- **WHEN** 一括割当を実行後に保存・復元し、同じ日数を進行する
- **THEN** 戦線所属とWorldStateのハッシュが一致する
