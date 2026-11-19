# Spec Delta

## ADDED Requirements

### Requirement: 二実装による地図描画（Canvas2D既定＋MapLibreオプション）
MVPのMapRenderer実装は、タイルサーバなしでパック同梱のGeoJSONから政治・地形モードを描画すること（SHALL）。既定実装はCanvas2D（決定論的表示・WebGL非依存・全環境で検証可能）とし、MapLibre GL JSをWebGL環境向けオプション実装（`?renderer=maplibre`）として提供しなければならない（SHALL）。両実装は同一のMapRenderer契約に従う（SHALL）。

#### Scenario: 政治モードの表示
- **WHEN** 現代東アジアパックで地図を開く
- **THEN** 5国家が政治モードで色分け表示され、canvasへ非黒のピクセルが描画される

### Requirement: ホバーと選択のPicking
地図はプロヴィンスのホバーと選択を提供し（SHALL）、選択対象は単一プロヴィンスでなければならない（SHALL）。海域・無主地は非選択対象である（SHALL）。

#### Scenario: プロヴィンス選択
- **WHEN** プレイヤーが陸地プロヴィンスをクリックする
- **THEN** そのプロヴィンスが選択され、境界がハイライト表示される

### Requirement: LODの2段階実装
MVPは簡略度の異なる2段階のジオメトリを同梱し（SHALL）、ズーム閾値で切替えなければならない（SHALL）。

#### Scenario: ズームアウトでの切替
- **WHEN** ズームレベルが閾値を下回る
- **THEN** 簡略化ジオメトリに切替わり、表示されるプロヴィンスID集合は不変である
