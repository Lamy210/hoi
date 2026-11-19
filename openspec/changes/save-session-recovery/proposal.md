# Proposal: save-session-recovery

## Why
セーブ後にブラウザを再起動すると命令番号が重複し、次の命令が拒否される。保存成功がIndexedDBの確定前に表示され、RPC応答が別要求に混入する問題もある。

## What Changes
- Workerが現在のジャーナルと衝突しないプレイヤー命令番号を発行する。
- RPC応答をrequestIdで相関し、タイムアウト/終了時に待機を解放する。
- セーブとロードは未実行のプレイヤー命令がない境界で実行する。
- IndexedDBのトランザクション確定と失敗をUIへ反映し、10スロットを選択可能にする。

## Capabilities
- Modified: save-system, game-ui

## Impact
Worker・UI・IndexedDB・公開用ブラウザテスト。v4セーブ形式は変更しない。ジャーナルの保持範囲を超えた完全な命令再実行防止、旧版移行、クラウド同期は後続。
