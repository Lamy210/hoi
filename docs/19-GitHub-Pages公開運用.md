# GitHub Pages 公開運用

## 方針
初期公開は GitHub Pages の静的サイト。Web Worker と IndexedDB を使用する。公開 URL は https://lamy210.github.io/hoi/ を想定。Vite の相対 base を維持する。

## 初回設定
1. Settings > Pages > Build and deployment > Source を GitHub Actions に変更する。
2. github-pages environment は main のみに公開を許可する。
3. Actions > Check > Run workflow で main を選択する。
4. check と deploy が成功し、environment の公開 URL が HTTPS で開けることを確認する。

## 完了条件
- タイトルからシナリオ・国家選択・地図・時間操作が動く。
- 同一ブラウザでセーブとロードが動く。ブラウザデータ削除や別オリジンへの移行時は .orbis をエクスポートする。
- パック出典表示、チェックサム、公開コミットと Actions run を確認する。

## 運用
PRは検査のみ。mainのpush及び手動実行は検査後に同じdist成果物を公開する。公開用ビルドにE2Eフックを含めない。ローカル全E2Eは npm run test:e2e で別モードを生成する。

公開失敗時はActionsログを確認。機能不良の場合は正常版のコミットを特定し、セーブ互換性を確認した上でrevert PRを作成する。再検証と再公開を行う。セーブデータの削除を復旧手段にしない。

データのライセンス表示はシナリオの SOURCES.json を維持する。コードライセンスおよび配布元の原典確認は別途実施する。
