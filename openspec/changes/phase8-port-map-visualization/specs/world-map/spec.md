# World Map — maritime ports and catalog information

## ADDED Requirements

### Requirement: Maritime-capable packの港を可視化
ロード済みパックに検証済みPortカタログが含まれる場合、Canvas2DとMapLibre両方の地図に港マーカーを表示できなければならない（SHALL）。港は実際に宣言された沿岸州にのみ紐づけなければならない（SHALL）。港のクリックは対象州を選択し、海上移動命令を出してはならない（SHALL NOT）。

#### Scenario: 地図で港を選ぶ
- **WHEN** 港のあるシナリオで港マーカーをクリックする
- **THEN** 港が紐づく州が選択され、所在州と港湾情報を確認できる

#### Scenario: 地図をズームする
- **WHEN** 港マーカーのある地図をパンまたはズームする
- **THEN** 港マーカーは州の表示位置に追従し、画面外では非表示になる

### Requirement: Maritime情報は静的と動的を分離する
港湾容量、修理/造船スロットなどの静的能力はカタログから表示し、現在の支配国は最新の世界スナップショットから表示しなければならない（SHALL）。これらの値を艦隊/船団の実利用可能能力と表示してはならない（SHALL NOT）。

#### Scenario: 支配国が変わる
- **WHEN** 対象港州のcontrollerが変化する
- **THEN** 港カタログを変更せず、現在支配国の表示が更新される

### Requirement: Legacy packに港を生成しない
maritime capabilityを持たない既存パックでは、港マーカーも港湾一覧も表示してはならず（SHALL NOT）、海上補給や上陸を利用可能と誤認させてはならない（SHALL NOT）。

#### Scenario: 沿岸だけの旧pack
- **WHEN** coastalフラグのみの旧packをロードする
- **THEN** 港表示スイッチは0港・非活性となり、架空の港は表示されない
