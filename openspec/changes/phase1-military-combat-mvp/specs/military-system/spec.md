# Spec Delta

## ADDED Requirements

### Requirement: 師団作成コマンド
師団作成は徴兵プールと装備財（歩兵装備）の実消費を伴い（SHALL）、不足する場合は作成されず理由が表示されなければならない（SHALL）。

#### Scenario: 装備不足の拒否
- **WHEN** 市場の歩兵装備が師団1個分に満たない
- **THEN** 作成コマンドは却下され、不足内容が表示される

### Requirement: プロヴィンス移動と経路
移動は隣接グラフ上のA*経路で行われ（SHALL）、海越え・未開戦状態での敵地通過は検証で拒否されなければならない（SHALL）。移動時間はエッジコストと補給係数から決定論的に計算される（SHALL）。

#### Scenario: 敵地直進の拒否
- **WHEN** 未開戦の相手領土を通る経路で移動命令を出す
- **THEN** コマンドは却下される

### Requirement: 宣戦コマンドと戦争状態
宣戦は戦争（participants・casusBelli・warScore・status）を開始し（SHALL）、CBの有無で安定度・外交的影響力へのペナルティが変わらなければならない（SHALL）。

#### Scenario: CBありの宣戦
- **WHEN** CBを持つ状態で宣戦する
- **THEN** 戦争が開始され、ペナルティはCBなしより小さい（トレースで確認可能）
