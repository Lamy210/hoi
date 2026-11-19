# Proposal

## Why
セーブ/ロードはPhase 1の必須機能であり、決定論検証（INV-8 往復一致）の実測場でもある。IndexedDBのクォータ退避（MDN確認済み）への対策としてファイルエクスポートも初期から提供する（docs/15 R-21）。

## What Changes
- `src/engine/save/` にスナップショット直列化（ストアごとtyped array→msgpack）・ヘッダ（version/schemaHash/seed/tick）・整合検証・移行チェーンの骨格を実装する
- `src/ui/storage/` にIndexedDBアダプタ（idbラッパ）・スロット10＋自動セーブ・エクスポート/インポートを実装する
- 往復ハッシュ一致テスト（CI必須）と不正セーブ拒否テストを整備する

## Capabilities
### Modified Capabilities
- `save-system`: msgpackスナップショット・IndexedDB保存・ロード検証・自動セーブの機能要件を追加

## Impact
- **対象Phase**: 1 の 6/7
- **後続依存**: ui（Change 7）のセーブ画面
- **リスク**: R-10（往復不一致）: derivedCache非保存＋再計算で対処。R-21（クォータ）: persist()要求＋エクスポート案内
