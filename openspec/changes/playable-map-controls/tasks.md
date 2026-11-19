# Tasks: playable-map-controls

- [x] 1.1 camera.ts / canvasAdapter.ts: Web Mercator、カメラ変換、ズーム・パン・Picking・LOD同期を実装。camera単体テストと公開用操作テストを追加。
- [x] 1.2 maplibreAdapter.ts / GameScreen.tsx: ズーム操作・北向き・Picking座標・LOD再配色・初期化失敗表示を整備。
- [x] 1.3 panels.tsx / store.ts / worker.ts: 研究・戦争導線、命令の未実行表示・明示的1日進行。通常UIテストを追加。
- [x] 1.4 pacer.ts: 経過時間積算による速度制御・応答待機を実装。
- [ ] 1.5 CI型検査・Vitest・公開用Playwright・OpenSpec strict合格を確認。
- [ ] 1.6 Pages公開後の実サイトで地図/研究/外交/建設/セーブの操作を確認。未完の操作やモバイル・MapLibre動作は追加検証。

- [x] 1.7 州検索からカメラを移動し、F/Enter/Escape操作に対応。DPR 2で地図クリックと建設操作の回帰テストを追加。
- [ ] 1.8 州検索・建設の追加CIと公開結果を確認。
