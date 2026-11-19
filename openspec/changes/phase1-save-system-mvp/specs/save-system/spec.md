# Spec Delta

## ADDED Requirements

### Requirement: msgpackスナップショットの実装
セーブはストアごとのtyped arrayをmsgpackで直列化し（SHALL）、ヘッダ（version・schemaHash・worldSeed・scenarioPackId・tick）とSHA-256 integrityを含まなければならない（SHALL）。

#### Scenario: 直列化の決定論
- **WHEN** 同一状態で2回セーブする
- **THEN** 生成されるバイト列が完全一致する

### Requirement: IndexedDBへの保存
セーブはIndexedDBに保存され（SHALL）、手動スロット10と毎ゲーム月の自動セーブを持ち、容量超過時は警告を公開しなければならない（SHALL）。

#### Scenario: 自動セーブの確認
- **WHEN** ゲーム月が切り替わる
- **THEN** 自動セーブスロットが更新され、メタ（tick・日付・シナリオ）が表示できる

### Requirement: ロード時検証の実装
ロードは「version検証 → 移行 → 整合検証 → derivedCache再計算 → 状態公開」の順序で行われ（SHALL）、検証違反は状態を適用せず拒否理由を表示しなければならない（SHALL）。

#### Scenario: 改ざんの拒否
- **WHEN** 在庫に負値を書き込まれたセーブをロードする
- **THEN** 拒否され、違反箇所が一覧表示される
