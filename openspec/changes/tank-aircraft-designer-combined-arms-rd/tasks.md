# Tasks — DESIGN-01 → DESIGN-02 → COMBAT-01 → AIR-01 → RND-01 → INTEGRATION-01

**規則:** 各行に目的 / 対象ファイル / 作業内容 / テスト / 期待値・完了条件を記載。各チャンクは見積1〜2時間以内。PR #55の独立strategy参照エンジンを本番WorldStateへ無検証に一括切替しない。旧セーブv18互換性は不要だが、新保存形式・hash・決定論は必須。

## DESIGN-01：仕様・受入条件（このPR）
- [x] 目的: 実データと既存システムの接続点を特定 / 対象: proposal.md / 内容: Design/Lot/Line/Research・既存編制/研究/生産・前PR制約を照合 / テスト: 現行mainパスの存在と解釈確認 / 期待: 参照実装と本番の別系統を明記
- [x] 目的: トレードオフ係数を固定 / 対象: design.md 1〜4 / 内容: chassis/frame/module表、速度/装甲/信頼性/IC/故障率、初期設計2例 / テスト: 手計算と数値範囲確認 / 期待: 合法/非合法の境界と副作用が説明可能
- [x] 目的: 戦闘/研究・MIOの順序を定義 / 対象: design.md 5〜10 / 内容: 地形幅、装甲/貫通、空戦/AA/CAS/爆撃、技術DAG、研究token、MIO XP / テスト: 損耗収支/翌Tick可視性の論理レビュー / 期待: 二重バフ・二重損耗を許さない
- [x] 目的: OpenSpec acceptanceの合意 / 対象: specs/{tank-designer,aircraft-designer,equipment-attrition,land-combat,air-operations,advanced-research,mio-organizations,integrated-invariants}/spec.md / 内容: SHALL/MUST要件とWHEN/THENシナリオ / テスト: OpenSpec strict / 期待: 要件8領域の検証可能なシナリオ
- [ ] 目的: 設計PRの品質確認 / 対象: 全OpenSpecファイル / 内容: strict validation、既存baseline重複と矛盾、誤記・計算例の確認 / テスト: GitHub CI / 期待: 既存checkとspec-design成功、PRレビュー可能

## DESIGN-02：モジュール設計純関数/版管理
- [ ] 目的: カタログスキーマ導入 / 対象: src/engine/strategy/designer/catalog.ts, data/packs/.../modules.json（新規） / 内容: Chassis/Frame/Moduleの宣言的定義・TechGate/Slot/Weight型 / テスト: 未知スロット/重量/ID重複/negative/NaN validator / 期待: 無効カタログをシナリオロード時に拒否
- [ ] 目的: 戦車設計式を実装 / 対象: src/engine/strategy/designer/tank.ts（新規） / 内容: Mass/PowerWeight/Speed/Armor/SA/HA/AP/BT/IC/R / テスト: 中戦車例と1000の差分ケース / 期待: 約31.8km/h・R.820・IC29.46、重すぎる設計拒否
- [ ] 目的: 航空機設計式を実装 / 対象: src/engine/strategy/designer/aircraft.ts（新規） / 内容: Thrust/Mass/Drag/Speed/Agility/Range/MissionCapability/IC/R / テスト: small fighter例と出力不足 / 期待: 約461km/h・894km・R.880・IC18.0
- [ ] 目的: 不変型式と版差分 / 対象: src/engine/strategy/model.ts、designer/revisions.ts / 内容: DesignRevision/frozenStats/技術解禁/設計局snapshot / テスト: 研究完了/改版/旧lot参照 / 期待: 旧型機体に自動強化なし
- [ ] 目的: 生産へ型番を接続 / 対象: src/engine/strategy/tick.ts, rules.ts / 内容: 統一IC/資材/ライン変更/モデル互換 / テスト: 生産切替・補充・保管ロット / 期待: 在庫保存則=製造−損耗

## COMBAT-01：陸軍編制・装甲/貫通・非戦闘故障
- [ ] 目的: 編制幅と装甲統合 / 対象: src/engine/strategy/combat/composition.ts（新規） / 内容: 大隊幅/硬度/装甲/貫通・実装備Lot抽出 / テスト: 1戦車で全師団装甲が最大にならない / 期待: width加重とmax+mean貫通が固定
- [ ] 目的: 6時間地上戦導入 / 対象: src/engine/strategy/combat/land.ts（新規） / 内容: スナップショット同時命中/Defense/Breakthrough/地形・幅/装甲半減/ORG+20% / テスト: AP=69.9/70境界と0ORG/HP / 期待: 不正な二重命中なし
- [ ] 目的: 戦車の信頼性故障 / 対象: src/engine/strategy/combat/attrition.ts（新規） / 内容: weather/terrain/distance/repairとlossLedger/seed / テスト: 6h 100両・R.80 vs .95 / 期待: 失った両数は現有以下、決定論
- [ ] 目的: 故障修理経済へ接続 / 対象: src/engine/strategy/tick.ts, model.ts / 内容: ready/repairing/廃棄の台帳と工業IC引当 / テスト: 修理0資材なら保有機数増えない / 期待: 同じ資産の二重配備なし

## AIR-01：航空隊・空戦/地上防空・CAS・爆撃
- [ ] 目的: 航空隊と基地データ導入 / 対象: src/engine/strategy/air/model.ts（新規） / 内容: Wing/AirRegion/Airbase/Fuel/Pilot/mission契約 / テスト: 空港能力超過・空域重複・航続圏外 / 期待: 不正コマンドatomic拒否
- [ ] 目的: 迎撃/制空権を実装 / 対象: src/engine/strategy/air/superiority.ts（新規） / 内容: 双方同時撃墜/detection/空戦力/陸軍defense-speedペナルティ / テスト: 迎撃戦闘機の寄与範囲 / 期待: 制空デバフ最大12/15%
- [ ] 目的: 地上AAとCASを実装 / 対象: src/engine/strategy/air/support.ts（新規） / 内容: 生存航空機のみAA/CAS、陸上命中上限 / テスト: 迎撃全滅・戦闘なし・AA0 / 期待: 二重撃墜なし、CASはground battleのみ
- [ ] 目的: 爆撃/兵站の翌日影響 / 対象: src/engine/strategy/air/bombing.ts（新規） / 内容: factory/airbase/rail/supplyHub損害とdirty revision / テスト: 爆撃当日生産不変、翌日減少 / 期待: 全Facility damage 0〜1
- [ ] 目的: 航空機の故障/補修 / 対象: src/engine/strategy/air/attrition.ts（新規） / 内容: 出撃した生存機体だけにbad weather/distance故障を適用 / テスト: 1機を複数causeで控除しない / 期待: 出撃前機数=生存+撃墜+事故+修理待ち

## RND-01：研究ツリー・MIO
- [ ] 目的: 基礎/部品研究DAG / 対象: src/engine/strategy/research/catalog.ts（新規） / 内容: foundation/module/techYear/UnlockIds / テスト: 循環/未知モジュール/未完成前提 / 期待: 不正技術ロード拒否
- [ ] 目的: 研究枠・速度の再調整 / 対象: src/engine/strategy/rules.ts, tick.ts / 内容: 教育・工業力・安定度を含むv2算式、RP正規化、枠縮小停止 / テスト: 研究枠2→3でも総RP不変 / 期待: 無からRPを増殖させない
- [ ] 目的: 時代先行token導入 / 対象: src/engine/strategy/research/token.ts（新規） / 内容: 2年上限・一度きり消費・国家方針/スパイ由来 / テスト: 2028研究2026開始と1年券 / 期待: penalty3.1→1.9かつ再使用不可
- [ ] 目的: MIO XP・特性DAG / 対象: src/engine/strategy/mio/*.ts（新規） / 内容: 設計/生産/研究タスク、XP ledger、perk分岐 / テスト: 停止中XP0・相互排他・cap20 / 期待: 無限XPなし、修正源の重複なし
- [ ] 目的: MIO snapshot適用 / 対象: src/engine/strategy/designer/*, rules.ts / 内容: frozen design/生産line/研究RPの適用位置を分離 / テスト: MIO昇格後に旧在庫の能力変化なし / 期待: 費用/速度/Rの上限遵守

## INTEGRATION-01：本番エンジン、UI、長期検証
- [ ] 目的: 保存系拡張 / 対象: src/engine/strategy/save.ts と実WorldState保存 / 内容: immutable design・airwing・MIO・tokenの完全復元/ハッシュ / テスト: 30/365Tick & 保存再開 / 期待: 決定論一致、旧セーブの互換不要
- [ ] 目的: 命令・UI連携 / 対象: command bus/React UI / 内容: デザイナー編集、研究/MIO画面、空域・戦闘幅のpreview、無効理由表示 / テスト: command revision conflictとPlaywright / 期待: 不正/平時攻撃をUIからも排除
- [ ] 目的: AI設計・補給連携 / 対象: AI planner/logistics / 内容: 評価予算内の設計候補、燃料/弾薬/空域/防空 / テスト: AI無限ループ、予算枯渇、停止復帰 / 期待: maxAIWorkを超えない
- [ ] 目的: 主要性能・バランスPoC / 対象: tools/bench.ts, tests/integration/* / 内容: 20 tank/20 air、500 division/200 wing/20 zone、3650日、10seed比較 / テスト: CPU/メモリ・TCO・ゲームスノーボール / 期待: 数値根拠が得られるまでp95未確認と表示
