## ADDED Requirements

### Requirement: 海域と港湾の型付き選択
海域・陸州・港湾を区別して描画・選択し、ズームやLOD変更後も同じ安定IDを返さなければならない（SHALL）。海域は主権境界と誤認させない。

#### Scenario: 海域モードの選択
- **WHEN** 海域をクリックしズーム後に同じ海域を選択する
- **THEN** 同じseaZone IDを返し陸州と混同しない
