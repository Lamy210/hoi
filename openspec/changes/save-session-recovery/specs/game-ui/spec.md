## ADDED Requirements

### Requirement: Worker RPC応答の相関
Worker RPCは各要求と応答を一意のrequestIdで関連付け、終了・失敗・タイムアウト時は待機を解放しなければならない（SHALL）。

#### Scenario: 同時照会
- **WHEN** AIログと他のRPC応答が異なる順で到着する
- **THEN** 各要求は自身に対応する応答のみを受け取る

### Requirement: セーブ操作の状態表示
保存画面は10個の手動スロット選択、処理中の重複操作の抑止、復元失敗の表示を提供しなければならない（SHALL）。

#### Scenario: 不正なセーブのインポート
- **WHEN** 不正なセーブファイルを選ぶ
- **THEN** エラーが表示され現在のゲーム状態が維持される
