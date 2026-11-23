# Design: 統合戦略シミュレーション（参照エンジン→本番段階導入）

## 1. 目標・制約
- TypeScriptで決定論的/再現可能。シナリオ起点の`rulesetVersion`固定。ブラウザWeb Workerで実行可能、外部I/Oなし。
- 未リリースの旧セーブv18との互換は不要。新ルールの参照サンドボックスで契約検証を先行し、実ゲーム本体は新しい保存形式と統合してから切り替える。
- 状態変更と読取専用スナップショット、計算トレース、命令/承認を明確に分離。

## 2. 正規スキーマと不変条件
| Entity | key / fields | 不変条件/保存 |
|---|---|---|
| `StrategyState` | ruleset,seed,tick,epochDays,nations[],regions[],provinces[],factories[],lines[],designs[],lots[],divisions[],plans[],focuses[],occupations[],quotes[],wars[] | 各エンティティID一意、参照先存在、導出cacheは保存しない |
| `PopulationCohort` | dependents,unemployed,workers,researchers,reserves,soldiers | 各値非負整数; 国家人口=Σ区分; 兵員は別勘定の追加人数ではない |
| `AdministrativeState` | id,ownerId,provinceIds,resources,occupationShares,population | provinceは1行政州のみ; Σ occupationShares≤1; state総工場能力は重複使用不可 |
| `Province` | id,stateId,ownerId,controllerId,terrain,infra,edges[],supply | ownerとcontrollerは独立; edgesは一意・非負; 戦域描画は派生 |
| `FactorySite` | id,stateId,type=civilian|military,baseIC,damage[0,1],repairCostIC,resourceNeeds | 使用可能IC=baseIC×(1−damage); 直接通貨を生成しない |
| `ProductionLine` | id,countryId,factoryIds[],designId,efficiency,carryIC,active | 一工場は同時に1ラインまで; 産出品は実生産後にlotへ |
| `EquipmentDesign` | id,kind,year,unlockTech,softAttack,hardAttack,defense,breakthrough,armor,piercing,reliability,IC,resources | 資源・信頼性の単位統一; unlockedだけでは師団能力不変 |
| `EquipmentLot` | holder=warehouse|division|garrison|transit,holderId,modelId,quantity | 総量はロットのみから集計。旧v18のtypedは合計への内訳 |
| `Division` | id,countryId,loc,armyId,planId,manualHold,manpower,organization,maxOrg,hp,maxHp,equipmentRequirements | 師団兵員はpopulation.soldiersから割当を受ける。装備充足率を実ロットから計算 |
| `OperationPlan` | id,countryId,enemyId,kind,autonomy,authorized,paused,provinceIds,targetIds,assignedUnitIds,revision,planning | 1師団の主プランは1つ; 平時攻勢は不可; manualHoldを上書きしない |
| `NationalFocus` | id,countryId,prerequisites[],exclusiveGroup,cost,progress,effects[] | DAG/未知効果拒否、completed IDは冪等 |
| `OccupationRecord` | stateId,countryId,share,resistance,compliance,policy,coverage,lastPolicyChangeTick | C/R∈[0,100]。元の施設使用権と占領徴収は排他的 |
| `MarketQuote` | goodId,countryId,basePrice,price,previousSupply,previousDemand | 正数・有限・有界。需給/価格は次tick確定 |

人口は当面国別cohortで管理。州ごとのPOP細分化は第2段階で導入し、国別cohortの内訳へそのまま加算して二重人口を作らない。

## 3. 資金・民需工場・建設の契約
国庫と家計プールは通貨の持ち主。民需工場は工期を短縮する工業能力、資材は消費される現物。
`DailyConstructionIC = min(CivilianICFree×(1−damage)×workerFill,MaterialAvailable/materialPerIC,LaborAvailable/laborPerIC,TreasuryAffordable/cashPerIC)`。
`cashSpent = progressIC×cashPerIC`は国庫→家計/サプライヤーへ振替（通貨総量保存）。`materialsSpent`はstockからのみ控除。`progress`上限はprojectRemaining。修理は通常建設と同じ資源と予算を取り合う。
キャパシティ0でも政策による緊急財政措置は可能だが、無料IC・貨幣生成はしない。

## 4. POP・研究・経済の因果
`PopulationTotal = dependent + unemployed + worker + researcher + reserve + soldier`。動員は未就業→予備→労働者からtransfer、研究者の無断移動禁止。人口増減は出生・死亡・転入・転出イベントだけを経由。
`LaborFill = min(1,availableWorkers/requiredWorkers)`、`ResearchCapacity = max(0.05,assignedResearchers×education×literacy×(1+bonuses))`。
`Unemployment`はcohort内のunemployed/workingAgeから派生。人口政策や損害の反映は次tickから。
`PriceTarget = BasePrice×clamp(sqrt((Demand+ε)/(Supply+ε)),0.25,4)`。参照Tickは本日終了時の資源在庫と翌日必要量を次TickのQuote需給に記録し、価格は次Tick先頭でのみ更新する。Supply=0/ Demand>0のとき高騰。 `PriceNext = clamp((1−α)PricePrev+αPriceTarget,0.25Base,4Base)`、α=0.2。取引は資金上限で数量を減額し、seller lot / buyer lotを同量で移動する。
同tickの賃金支給→消費→GDP→賃金再計算を禁止。市場需給は前tick確定数量に由来。

## 5. 戦略爆撃→修理→資源不足→生産
当日生産入力は`intactIC = Σ baseIC×(1−startOfDayDamage)`。
`OperatingIC = intactIC × workerFill × min(resourceFill,energyFill) × lineEfficiency × modifiers`。
`Produced = floor((OperatingIC+carryIC)/design.IC)`; carryICは当該モデルの同じラインだけ保持。資源は先に予約した数量だけ消費し、出力と整合。
爆撃に伴うdamage増加は戦闘フェーズに確定するため翌tickのICから減少。修理も予算・資材・土木ICを消費し、翌tickの稼働に反映。資源ペナルティをIC算定と別のpostOutput段階で再乗算しない。
装備劣化: `LossExpected = Deployed×(1−reliability)×exposure×0.002`、再現可能RNGの決定論的整数損耗。生産/移送/廃棄でTotalLotsの収支監査。

## 6. 戦闘・装備統合
`RawAttack = SA×(1−hardness)+HA×hardness`。
`EffectiveAttack = RawAttack×M_terrain×M_weather×M_supply×M_commander×M_doctrine×(1+planning)`。
`DefPool = defender? Defense : Breakthrough`、実被弾6時間期待値:
`Hits=0.012×[0.15×min(EffectiveAttack,DefPool)+0.55×max(0,EffectiveAttack−DefPool)]`。
`OrgLoss=Hits×2`、`HpLoss=Hits×0.25`。当日4サブフェーズ。装甲vs貫通の追加修正は被弾計算の一箇所のみとする。
参照戦闘はORG/HP低下と確定した死亡者・装備損失を一体で記録し、壊滅者の残余兵員を予備役に戻す。旧v18戦闘との後方互換は要求しない。装甲/貫通の実戦への適用、天候、戦術、同時攻撃解決は後続タスク。

## 7. 研究枠・国家方針・国家精神
`Slots = clamp(1+I[RCI≥0.30]+I[RCI≥0.50]+I[RCI≥0.70]+I[RCI≥0.88]+focusBonus,1,6)`。
`RP_country = base + researchers×literacy×education×infrastructure`; 有効研究へ重み正規化して配分。先行ペナルティ`min(5,1+0.75ΔY+0.15ΔY²)`。枠縮小は進捗保持して一時停止。研究機関/MIOによる分野特化倍率の合計は最大+30%。
国策は検証済みDAG+実行済みIDで完全冪等。効果は型付きModifierで中間集約して翌tick有効化。同一sourceId×statKey×instanceIdを重複適用禁止。

## 8. 補給・AI・性能上限
- Region（補給/州）ごとにdirty revision。補給の通行網変更・爆撃・支配変更時だけ部分再計算。戦争状態の変化時は当該戦域のキャッシュ破棄。
- 経路探索は`O((V+E)log V)`の優先キューDijkstra/A*。フロント/師団の総当たりを禁止し、最大`K=8`候補×配置可能師団/作戦、1回の再計画上限: 1000評価・32経路・16移動命令（初期値）。
- 1師団の主作戦は1つ（`unit.planId`と計画参加者IDは相互検証）。manualHold>armyExplicit>armyGroup>theaterという優先順位は将来の本番連携で実施する。参照TickではAUTO計画・戦争・明示承認・ORG/HP>0を必要条件とする。
- 参照AIは最大16件/日、最大1000件の候補を評価し、計画順序・師団開始位置を日ごとに循環して飢餓を防ぐ。実コマンドの発行とrevision再検証は本番連携時に実施する。
- 時間計測基準：基準シナリオ(2,000プロヴィンス、500師団、20戦線、5国家)で日次p95 50msは目標であり未計測。計算時間/最悪ノード数をCIに記録。

## 9. 占領
`GarrisonCoverage = min(1,ActualSuppression/GarrisonDemand)`。`Demand=max(0.2,popMillions×0.30×(1+R/100)×policyFactor)`。
`Rtarget = clamp(15+0.25(100−C)+10War+Grievance+PolicyDelta−18Coverage,0,100)`。
`Rnext = clamp(R+0.04(Rtarget−R)+incident,0,100)`。
`Cnext = clamp(C+0.09(1−C/100)×policyCompliance×coverage×(1−R/125)−max(0,R−60)×0.003,0,100)`。
工場接収は`physicalIC×controlledShare×takeFactor×(1−0.004R)`に制限、総割当は`ΣcountryAlloc ≤ physicalIC`を保証。政策変更30日クールダウン。garrison manpower/equipmentは通常師団からは重複利用不可。

## 10. 確定したTickパイプライン（1日）
`beginTick()`: 前tickのCommit済み値でread snapshotと入力版を固定。命令検証・編入確認。

|順| phase | 参照値/書込 | 更新可視化 |
|---|---|---|---|
|1| economy-market | 昨日の確定需給→価格更新、納税/賃金、建設IC/修理を予約 | 金銭収支と市況をCommit。価格は後続の即時再評価に使わない |
|2| research-production | 先頭スナップショットのPOP/研究枠/工場損害/資源で研究と生産。装備ロット移転 | 当日の産出をCommitするが戦闘装備補充は次tick |
|3| supply-movement-delegation | 前tick確定の物流ネットワーク・作戦承認と手動固定。予算付きAI。補給を配賦 | 移動を確定し、再計画は周期/dirtyのみ |
|4| combat-airstrike | 移動確定位置・戦闘開始時の補給値で4×6時間解決。爆撃damageを記録 | 新しい工場損害は次tickの産出から |
|5| occupation-politics | 戦闘結果→土地支配/抵抗/順応/国家精神/国家方針更新 | 翌tickの所有・政策効果・人口変化へ反映 |

`endTick()`: balances, finite, inventory, exclusive POP, capacity, AI attack permission invariant検査→結果commit→trace/hash。
**注意:** 現行`registerAllSystems`は補給→戦闘→生産→前線AI→経済→人口→政治→研究→建設。本PRは`runStrategyTick`で独立に契約を検証する。旧セーブ互換は不要だが、動作する本番ゲームを壊さないよう接続は別作業とする。

## 11. 移行・運用・障害/DR
- 旧セーブの移行は行わない。新規シナリオから国別POP、施設、型番ロットを初期化する。参照エンジンは現在v19専用。実ゲームのv19接続は後続作業。
- 完全移行時には旧ゲームルールセットv18を廃止可能。新セーブの原子的検証/復元・ハッシュ一致を必須とする。
- 失敗したTickは先頭スナップショットへロールバックし、国庫・在庫・人口が半端に書かれないようにする。ルール違反はErrorで停止/識別ログ。
- ログ: rulesetVersion, phase, tick, market price delta, cash balance, population delta, stock balance, ai nodes/pathfind, attacksRejected。
- 監視: tick_p95_ms(5国家/500師団), finance_balance_error=0, population_cohort_error=0, equipment_inventory_error=0, duplicate_factory_alloc=0。
- 修復経路: メトリクス閾値超過→最新保存/バージョンを検証→巻戻し、障害時に料金発生する外部サービスなし。主要コストはブラウザCPU、メモリ、セーブサイズ。

## セーブ互換性の変更（正式決定）
未リリースのためv18以下との互換性は保証しない。実エンジン接続時は新形式へschemaVersionを上げ、旧形式は明示的に拒否し、新規ゲームの初期化を提示する。今PRの参照シミュレーション自身にもラウンドトリップ検証を用意する。


## 12. PR #55 レビュー修正：実装済みの境界条件（2026-11-23）

- **建設と生産の労働競合**：予算/材料が0なら完成作業量0、実作業ICに比例した労働力のみ引き当てる。空振り建設は後続工場の稼働を止めない。
- **戦闘不能**：ORG=0、HP=0、兵員=0、壊滅済み、移動中は当日の戦闘開始対象外。戦闘HP損害に伴う整数の人員死亡と型番別装備損失を台帳から控除し、壊滅師団の生存兵は予備役へ戻す。死者数分だけ国別POPと元国家の地域人口が減少し、`POPbefore−POPafter=reportedCasualties`を検証する。故障信頼性の確率的運用損耗はまだ本Tickへ未接続。
- **配備型番と実戦力**：必要装備を宣言した師団では保有するロットの充足率と配備設計型番の攻防値を参照。倉庫在庫・研究のみでは強化されない。必要装備未設定の旧テストデータは静的な基礎値で動く。完全な大隊・装甲/貫通・航空/海軍ドクトリン連動は後続。
- **市場**：最初に前日のQuoteで価格を決定し、当日の生産/資材消費後、実在庫と翌日予定需要をQuoteへ記録する。地域が占領されていれば該当国のアクセス持分だけを資源供給と数える。市場取引の完全な需給約定は後続。
- **研究**：`epochDays + tick`から暦年を算出し、占領による工場利用権の喪失・人口の労働者不足を研究枠工業力へ反映する。
- **AI**：プランの参加者と師団のplanIdは一対一。命令が実際に生成された場合にのみ師団を予約する。評価開始位置を日ごと16件単位で巡回し、先頭16師団だけが永久に選ばれる状況を防ぐ。実命令のコマンドバス連携・経路探索は未実装。
- **国家方針**：グローバルIDではなく国ID×FocusIDを一意キーとする。汎用フォーカスを国ごとに共有し、同国内の依存条件だけを検証する。
- **占領工場の移管**：`transferFactoryOperation`は占領権限を検証し、工場操業国の変更と旧生産ライン停止を不可分に実行する。未完了建設は引き継がず破棄（消費済みの実支出は返さない）。捕獲工場は操業権・占領率で有効ICを制限し、元国と占領国に二重割当しない。実ゲームの占領完了コマンド/GUIとの配線は後続。
- **障害/保全**：Stateを1回cloneし、ルール違反時はcloneだけ破棄する。人口は戦闘死亡分のみ減少を許容し、通貨は全保有者合計一定、ロットは産出−消耗で保存を検証。保存形式v19は旧v18と非互換。
- **性能**：今回のテストは機能・短期決定論性に焦点。2000州/500師団のp95 50ms目標は未計測であり、保証・達成済みとは表記しない。
