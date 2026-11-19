## MODIFIED Requirements

### Requirement: データ駆動のイベント定義
イベントは宣言的データ（条件・トリガー・効果）で定義され（SHALL）、イベント定義内に実行コードを含めてはならない（SHALL NOT）。event-systemはシナリオパックの events.json からイベントを読み込み、日次でトリガー（date / warStart / provinceOccupied / stockBelow）を照合し、効果（relation / equipment / manpower / alert / declareWarAI）を適用しなければならない（SHALL）。`once: true` のイベントは1回のみ発火し、発火履歴はセーブに含まれ、復元後に再発火してはならない（SHALL）。

#### Scenario: MODイベントの追加
- **WHEN** MODが新イベントを定義する
- **THEN** 検証を通過した後に通常イベントと同じ経路で発火する

#### Scenario: 発火履歴の保存
- **WHEN** イベント発火後にセーブしてロードする
- **THEN** 同一イベントは再発火しない
