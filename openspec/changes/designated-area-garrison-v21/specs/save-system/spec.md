# Save system — v21 area garrisons

## ADDED Requirements

### Requirement: 駐屯作戦は世界ハッシュ・セーブに含む
v21の保存はGarrisonOrderとnextGarrisonIdを記録し、ロード時に所有権・IDの唯一性・作戦制約・師団参照と前線との二重所属を検証しなければならない（SHALL）。

#### Scenario: 作戦の継続
- **WHEN** 駐屯作戦を保存してロードし、同一入力で日次を進める
- **THEN** 週次の自動配置を含めて世界ハッシュが各Tick一致する

#### Scenario: 存在しない師団への参照
- **WHEN** セーブ内の駐屯師団IDを存在しない値に書き換える
- **THEN** 復元を拒否する

### Requirement: v20以前のセーブは同一のハッシュで検証
v20以前のセーブ復元時には駐屯状態を空で生成し、旧版のハッシュ検証に新しい駐屯セクションを含めてはならない（SHALL NOT）。

#### Scenario: 過去のセーブ
- **WHEN** 正しいv20セーブを開く
- **THEN** セーブの整合性を確認したうえで駐屯作戦ゼロ件として読み込む
