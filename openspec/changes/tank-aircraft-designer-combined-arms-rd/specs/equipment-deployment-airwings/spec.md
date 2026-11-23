## ADDED Requirements

### Requirement: 型番別の装備台帳を原子的に倉庫と部隊の間で移転する
装備の配備・返却は国家・部隊・型番・在庫数量・対象装備種別を一体で検証し、既存Lotのバケット移動のみで実行しなければならない（SHALL）。移転時に国家全装備数を増減させてはならず（MUST NOT）、コマンドの期待Revisionが古い場合は状態を変更せず拒否しなければならない（SHALL）。師団の要求装備はmodelIdではなくcategory別であり、旧・新モデルを合算して上限を適用する。

#### Scenario: 倉庫の新型戦車を師団へ配備
- **WHEN** 自国製中戦車1両の倉庫Lotがあり、師団にtankカテゴリの装備需要1が設定されている
- **THEN** 倉庫から師団へ1両移り、全装備数不変、実配備型番に基づく師団火力は増加する

#### Scenario: 在庫不足やカテゴリー上限
- **WHEN** 既に戦車需要1/配備1の師団へ追加の戦車1両を指定する
- **THEN** 装備需要超過で拒否し、倉庫・配備・コマンドRevisionは不変である

#### Scenario: 同じ配備コマンドを再送
- **WHEN** 適用前のequipmentCommandRevisionを持つ旧コマンドを適用済みStateへ再送する
- **THEN** stale revisionで拒否し、二重に在庫が移転しない

### Requirement: 師団は型番を区別しつつ装備カテゴリー単位で需要を制限する
師団は `infantry/artillery/tank/support` の装備需要を持ち、既配備された同カテゴリーの複数設計revisionを合算して補充上限を計算しなければならない（SHALL）。航空機型番を師団Lotに直接配備すること、交戦中/移動中/壊滅した部隊への手動装備変更を禁止する（MUST NOT）。

#### Scenario: 他国設計と機体の不正配備
- **WHEN** 自国師団へ他国所有の戦車型番またはaircraft型番を直接配備しようとする
- **THEN** 検証層で拒否し、国家・師団のLotと兵員は不変となる

#### Scenario: 装備需要の引き下げ
- **WHEN** 師団がtank1を保有しているのに需要を0へ変更しようとする
- **THEN** 装備を暗黙に消したり無償で倉庫へ返さず、返却コマンドが必要として拒否する

### Requirement: 航空基地・航空隊は正規装備Lotと国家兵員を参照する
AirBaseは国の支配下のprovinceと最大駐機容量・施設損傷を持つ。AirWingは国、基地、aircraft型番、現役兵員から予約したpilot、grounded任務状態を持ち、保有機数を独立に保存してはならない（SHALL）。稼働機数はAirWing Lot、修理待ちはRepairing Lotから派生し、baseの駐機数は両方の合計で計算する（SHALL）。AirBase建設・航空作戦はこの段階では追加しない。

#### Scenario: 100機を駐機させ20機を修理待ちにする
- **WHEN** ready100機中20機を修理待ちバケットへ移す
- **THEN** ready80、repairing20、駐機100機、国家総保有100機となる

#### Scenario: 搭乗員数の二重引当
- **WHEN** 国家現役兵員22人中、陸軍20人が配備済みで、航空隊へpilot3人を予約する
- **THEN** POPの上限超過として原子的に拒否する

### Requirement: 駐機上限と航空基地の出撃運用枠を別々に管理する
新機体受け入れはbase.capacityを超えてはならない（SHALL）。運用可能枠はfloor(base.capacity×(1−damage))であり、満杯の基地でも既駐機機体は運用枠を持たなければならない（SHALL）。複数航空隊への運用枠の割り当ては航空隊ID昇順で実行し、枠を二重使用してはならない（MUST NOT）。この稼働枠は燃料・航続・任務解禁を検証した実sortie数ではない。

#### Scenario: 基地が満杯
- **WHEN** capacity2の基地にready2機、pilot2人を配置し施設損傷0である
- **THEN** freeHangars=0、operationalSlots=2となり、駐機枠0を理由に既存機の出撃枠を0にしない

#### Scenario: 75%損傷の基地を航空隊2つが使用
- **WHEN** capacity4で、各1機・各pilot1のwing2つを配置し、base.damage=0.75になる
- **THEN** 2機が基地に駐機したまま、稼働枠1を航空隊ID昇順で一回だけ割り当てる

### Requirement: 装備配備・搭乗員・修理キューは保存復元で一意に再生する
国家・ロット・航空隊・航空基地・コマンドRevisionをセーブの正本として保存・チェックサム照合しなければならない（SHALL）。修理待ちからreadyへの復帰は工業IC/材料を実消費する修理ワークオーダーが整うまで行わず、無料で機体を復帰させてはならない（MUST NOT）。

#### Scenario: 航空隊の保存・復元
- **WHEN** 新型航空機を2機配備し、pilot2人を割当て、1機を修理待ちとして保存する
- **THEN** 読込後もairwing1、repairing1、pilot2、駐機合計2、コマンドRevisionが一致する

#### Scenario: 型番Lotの偽装
- **WHEN** 陸軍へaircraft型番を格納するか、airwingへ異なる型番のLotを紐付ける
- **THEN** State検証で拒否し、破損保存状態を受け入れない
