# World map — East Asia maritime starter assets

## ADDED Requirements

### Requirement: 東アジアpackが宣言した7港のデータは厳密なチェックサムで保護する
現代東アジアシナリオは港湾/海域capabilityを明示し、港7、海域4、海路5、ゲート0のカタログを検証してから地図に渡さなければならない（SHALL）。

#### Scenario: 初期港データをロード
- **WHEN** 正しい`modern-eastasia`パックv0.2.0をロードする
- **THEN** 港7件の沿岸州・海域・容量が表示でき、改ざんした資産は拒否される

### Requirement: 初期設備・航路重みはゲーム用の仮値である
Portのcapacity/repairSlots/dockyardSlotsとNavEdgeのcostはゲーム設定の無次元値であり、現実の港湾施設能力や輸送実績であると表示してはならない（SHALL NOT）。

#### Scenario: 港を選択する
- **WHEN** 釜山港を選んで情報パネルを開く
- **THEN** 釜山州とゲーム用設備能力が表示され、上陸・海上補給が実行可能と誤認させない

### Requirement: fileプロトコルのシナリオも同一の海事資産を読み込む
通常Webで検証されたパックとオフラインpackは、同一のポート/海域IDを使用しなければならない（SHALL）。

#### Scenario: オフライン読み込み
- **WHEN** 静的パックをバンドルしたファイルモードで起動する
- **THEN** 7つの港と4海域がUIで利用できる

### Requirement: 旧packを海域対応に見せかけない
maritime capabilityを持たないpackには港が存在しない。旧pack test fixtureは明示的にcapabilityとmaritimeを除去する（SHALL）。

#### Scenario: 旧pack
- **WHEN** capabilityを持たないpackをロードする
- **THEN** 追加の港を生成せず旧形式のまま利用できる
