# Spec Delta

## ADDED Requirements

### Requirement: プロヴィンスバトルの日次解決
戦闘はプロヴィンス単位で1日ごとに解決され（SHALL）、地形・補給・装備・組織率・決定論ロールを係数として含み、全contributorsがトレース可能でなければならない（SHALL）。

#### Scenario: 日次損耗の決定論
- **WHEN** 同一状態・同一シードでバトルを再解決する
- **THEN** 日次損耗列が完全一致する

### Requirement: 占領タイマとcontroller移転
防衛軍不在で攻撃側が占領期間（既定14日）支配し続けたプロヴィンスは、占領コマンドによりcontrollerが移転し（SHALL）、地図と補給グラフが更新されなければならない（SHALL）。

#### Scenario: 占領完了
- **WHEN** 敵プロヴィンスを14日間支配する
- **THEN** controllerが攻撃側に変化する

### Requirement: 撤退処理
組織率が20%を下回った師団は味方支配の隣接プロヴィンスへ強制撤退し（SHALL）、撤退先が存在しない場合は包囲状態に移行しなければならない（SHALL）。

#### Scenario: 強制撤退
- **WHEN** 防衛師団の組織率が20%を下回る
- **THEN** 師団は味方隣接プロヴィンスへ撤退する
