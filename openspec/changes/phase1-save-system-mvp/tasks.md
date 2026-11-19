# Tasks

## 1. save-system 実装

- [x] 1.1 【目的】スナップショット直列化を作る 【対象】src/engine/save/serialize.ts 【作業】ストアごとtyped array→msgpack（@msgpack/msgpack 3.x）・ヘッダ（version/schemaHash/worldSeed/scenarioPackId/tick）・integrity（SHA-256） 【テスト】直列化の決定論（同状態→同バイト列） 【期待値】baseline「スナップショットの往復一致」の前提 【完了】unit test緑
- [x] 1.2 【目的】復元と検証を作る 【対象】src/engine/save/load.ts 【作業】version検証→移行（空チェーン）→整合検証（負値・範囲外・参照切れ）→derivedCache再計算→ハッシュ確認 【テスト】改ざんセーブ（負値挿入・checksum破壊）の拒否 【期待値】baseline「不正セーブの拒否」通過 【完了】unit test緑
- [x] 1.3 【目的】IndexedDBアダプタを作る 【対象】src/ui/storage/idbAdapter.ts 【作業】idbラッパ・スロット10＋自動（メタ: tick/日付/シナリオ）・QuotaExceededError時の警告フラグ 【テスト】保存/読込/削除のunit test（fake-indexeddb） 【期待値】baseline「自動セーブとエクスポート」の保存側 【完了】unit test緑
- [x] 1.4 【目的】エクスポート/インポートを作る 【対象】src/ui/storage/fileTransfer.ts 【作業】.orbisファイルのBlob出力・ファイル選択読込・検証経由ロード 【テスト】export→importの往復テスト 【期待値】docs/16 A-3（不正処理で拒否・クラッシュしない） 【完了】unit+E2E緑
- [x] 1.5 【目的】往復一致テストをCIに組み込む 【対象】tests/golden/saveRoundtrip.test.ts 【作業】任意tickでセーブ→ロード→続行→ハッシュ一致（INV-8）・移行ダミー（v0→v1）のテスト 【テスト】CI 【期待値】docs/16 Q-7通過 【完了】CI緑
