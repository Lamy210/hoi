# 統合グランドストラテジー実行基盤への移行

## Why
Phase 9（提案）。既存 integrated-grand-strategy-foundations と tank-aircraft-designer-combined-arms-rd は参照モデルを実装したが、実ゲーム WorldState / Worker / UI との統合が残る。第三のエンジンは作らない。

## What Changes
CR-01 正本二重化→ドメインごとに一正本へ移行。CR-02 通貨/IC混同→別単位。CR-03 在庫/日次需給混同→採掘・売注文・需要フロー。CR-04 税/賃金循環→前日確定値。CR-05 POP二重計上→排他的台帳。CR-06 動員不況→復員と再就職。CR-07 爆撃復旧不能→修理/輸入/財政再建。CR-08 無限国債→債権債務。CR-09 占領二重取得→操業権。CR-10 工場二重予約→容量台帳。CR-11 貿易二重売却→出荷予約。CR-12 手動命令上書き→優先順位。CR-13 経路総当たり→dirty/予算。CR-14 戦闘順序依存→同時確定。CR-15 無承認攻撃→実行時再検証。CR-16 国号変更で参照破損→不変ID。CR-17 政体と思想混同→独立軸。CR-18 独裁一強→維持費と不満。CR-19 政変連発→蓄積と冷却。CR-20 modifier暴走→集約と上限。CR-21 研究枠でRP増殖→有限RP。CR-22 既存装備自動強化→不変リビジョン。CR-23 型番切替→共通部品効率。CR-24 故障二重計上→原因別損耗。CR-25 航空無限出撃→燃料/機数/天候。CR-26 市場振動→平滑化。CR-27 小国研究→教育/技術輸入。CR-28 駐屯二重人員→排他予約。CR-29 不正数値→有限性と整数性。CR-30 大規模処理→時間分割と実測。

本Draftのコード範囲はCR-29、決済丸めと365日枯渇回帰のみ。残りは承認・実装・CIが必要。既存baselineや既存changeを削除しない。旧セーブ互換不要だが、移行完了まで現行ゲームを維持する。

## Capabilities
### New Capabilities
- politics: 政治危機と政府属性の統合契約
- economy_pop: 資金・物量・人口の統合契約
- industry_production: 物理容量と生産契約
- designer_research: 設計と研究契約
- military_combat: 同時戦闘・作戦契約
- occupation: 占領資産・抵抗契約

## Impact
src/engine/core, strategy, systems, scenario, save, worker, ui, tests。上記は移行目標の新しい横断仕様で、既存ドメインbaselineを置換したと主張しない。完全統合の受入前に既存deltaとの要件重複を整理する。