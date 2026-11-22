# Tasks
- [x] 目的: 選択対象の安定性 / 対象: mapSelection.ts / 作業: 自軍フィルタ、矩形投影、置換・追加・解除・トグル / テスト: Vitest / 期待値: ID昇順、上限256、ゲーム状態無変更 / 完了条件: テスト作成
- [x] 目的: レンダラ間の一致 / 対象: maprender/{types,canvasAdapter,maplibreAdapter}.ts / 作業: CSSピクセルの州投影API / テスト: 型検査・Playwright / 期待値: 両レンダラの契約一致 / 完了条件: API接続
- [x] 目的: マウスによる軍編成操作 / 対象: GameScreen.tsx,styles.css / 作業: 明示的な矩形モードと一覧Shift範囲、Ctrlトグル / テスト: Playwright / 期待値: パン・ズーム非破壊、タッチ操作可 / 完了条件: UI実装
- [ ] 目的: 品質ゲート / 対象: GitHub Actions / 作業: 型検査、Vitest、ビルド、Playwright、OpenSpec / テスト: CI / 期待値: 全件成功 / 完了条件: Squash Merge
