# Tasks

## 1. scenario-system 実装

- [x] 1.1 【目的】共通バリデータを作る 【対象】src/engine/validate/validators.ts 【作業】範囲・参照整合・checksumの共通検証関数群を実装（save/modで再利用） 【テスト】各検証のunit test 【期待値】違反一覧を収集して返す（最初の1件で中断しない） 【完了】unit test緑
- [x] 1.2 【目的】パックロードフローを作る 【対象】src/engine/scenario/loader.ts 【作業】manifest検証→スキーマ→参照整合→checksum→初期状態構築の順序実装 【テスト】正常パックで通過・不正（未知財キー等）で全違反表示 【期待値】docs/16「ゲーム開始」のロード 【完了】unit+integration test緑
- [x] 1.3 【目的】選択データAPIを作る 【対象】src/engine/scenario/catalog.ts 【作業】パック一覧（バージョン・出典・互換性）・国家一覧・開始状況サマリをUIに提供 【テスト】API応答のunit test 【期待値】docs/11 §1の選択画面データ要件を満たす 【完了】unit test緑
- [x] 1.4 【目的】現代東アジアパックを同梱する 【対象】public/assets/scenarios/modern-eastasia/ 【作業】countries（5国）・stats（WB 2023人口/GDP）・SOURCES.json（帰属文）・manifest/checksums 【テスト】ロード統合テスト＋総和検証 【期待値】5国家・~120州・INV-1/総和整合 【完了】integration test緑、SOURCES.jsonレビュー済

## 2. country-system 実装

- [x] 2.1 【目的】CountryStoreを構築する 【対象】src/engine/country/countryStore.ts 【作業】SoA配列（nameKey/color/capital/government/treasury/stability等）の初期化 【テスト】首都不在国家のパックで拒否 【期待値】docs/16「ゲーム開始」の国家選択前提 【完了】unit test緑
- [x] 2.2 【目的】国庫と指標の初期値を作る 【対象】src/engine/country/commands.ts 【作業】国庫収支コマンド（負禁止・検証）・安定度/支持率の初期値設定（トレース付き） 【テスト】負国庫コマンドの却下 【期待値】トレースでcontributors取得可能 【完了】unit test緑
- [x] 2.3 【目的】国家消滅の整理処理を作る 【対象】src/engine/country/extinction.ts 【作業】全領土喪失検知→戦争脱退・条約無効化・AI除外（フックはChange 5で接続） 【テスト】領土0国家の消滅フロー 【期待値】参照切れが残らない 【完了】unit test緑

## 実装結果（2026-11-14）

- 2.3を除き全タスク完了。国家消滅はPhase 1のゲームループでは発生しないためPhase 2へ繰り込み。
