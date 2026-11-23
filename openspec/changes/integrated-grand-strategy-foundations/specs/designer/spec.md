## ADDED Requirements

### Requirement: 設計型番と実配備の区別
装備モデルはカテゴリ、年代、解禁技術、Soft/Hard Attack、Defense、Breakthrough、Armor、Piercing、Reliability、IndustrialCost、ResourceCostを持つ宣言的データとし（SHALL）、実配備なしで同カテゴリの全師団を強化してはならない（MUST NOT）。

#### Scenario: 研究と型番設計
- **WHEN** 新設計のunlockTechだけが完了
- **THEN** 生産可能型番が追加されるが、旧装備の師団攻防値は不変

#### Scenario: 低信頼性の戦車
- **WHEN** 信頼性0.6の戦車を不整地で運用する
- **THEN** 信頼性0.95の同数量モデルより非戦闘損耗期待値が大きい

### Requirement: リライン・修理・設計世代の経済的代償
新型への生産ライン切り替えは効率移行損失を伴い（SHALL）、現在までの積算生産量を新型の在庫として流用してはならない（MUST NOT）。

#### Scenario: 生産ラインの新型更新
- **WHEN** ラインを新しい型番へ変更
- **THEN** 既存在庫は型番ごとに残り、効率・端数ICは明示ルールで移行または廃棄される
