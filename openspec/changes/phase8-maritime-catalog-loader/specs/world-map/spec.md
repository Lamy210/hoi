# World map — typed maritime catalog

## ADDED Requirements

### Requirement: 海域・港湾・海路・ゲートは型付きでロード
海域対応のシナリオはmanifest上のversion capabilityを明示し、港・海域・海路・ゲートの4つのアセットを同一の整合性検証済みセットとしてロードしなければならない（SHALL）。旧陸専用packは海域capabilityなしのまま機能しなければならない（SHALL）。

#### Scenario: 旧陸専用pack
- **WHEN** maritimeMapVersionの無い既存packをロードする
- **THEN** 海域データは存在せず、港や海上移動を暗黙に生成しない

#### Scenario: 海域capabilityあり
- **WHEN** manifestにv1を宣言し4アセットのchecksumが全て一致する
- **THEN** IDと参照が正しい海域/港/ルート/ゲートのカタログを構築する

### Requirement: 参照と容量の厳密な検証
各港は存在する沿岸州を一意に参照し有効な海域に接続しなければならない（SHALL）。海域隣接は対称で経路定義と一致し、経路costは正かつ有限、gateの参照は全て相互に一致しなければならない（SHALL）。

#### Scenario: 不正な非沿岸港
- **WHEN** 内陸州へ港を定義する
- **THEN** ロードは拒否される

#### Scenario: 片側だけの海域隣接
- **WHEN** 海域AがBを隣接とするがBがAを隣接としない
- **THEN** ロードは拒否される

### Requirement: 改ざん・欠落を許さない
海域capabilityが存在するとき4つの必須アセットが欠落またはSHA-256不一致ならロードを拒否しなければならない（SHALL）。

#### Scenario: 港湾容量の改ざん
- **WHEN** checksum生成後に港のcapacity値だけを書き換える
- **THEN** バイト検証時にロードを拒否する
