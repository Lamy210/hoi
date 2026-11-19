## ADDED Requirements

### Requirement: 検証済みペイロードと必須チェックサム
SHA-256検証モードではmanifest、provinces、countries、adjacency、meta、SOURCES、geometry-lod1、geometry-lod2、decorationの全JSONにチェックサムが存在し、HTTP成功・64桁小文字hexのSHA-256一致を確認しなければならない（SHALL）。任意のevents、techsは登録時のみ検証して使用する。検証したゲームデータのテキストを直接パースしなければならない（SHALL）。描画用の再取得も初期ロード時のチェックサムで検証する（SHALL）。

#### Scenario: 欠落・破損
- **WHEN** 必須チェックサムの欠落、HTTP失敗、SHA-256不一致のいずれかが発生する
- **THEN** パックロードは拒否される

#### Scenario: 公開更新による地図差し替え
- **WHEN** 初期ロード後の地図取得で異なるチェックサムの内容が返る
- **THEN** 描画用ロードは拒否される

### Requirement: 地図LODと州インデックスの整合
SHA-256検証モードでは両LODがFeatureCollectionであり、州数・ID順序がprovinces.jsonと一致し、各地物がPolygonまたはMultiPolygonでなければならない（SHALL）。

#### Scenario: 州の順番が異なる地図
- **WHEN** 正しいチェックサムを持つLODに州ID順序の不一致がある
- **THEN** パックロードは拒否される
