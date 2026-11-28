# Design: 実ゲーム統合

## 正本と移行
既存WorldStateをライブエンジンの正本とし、strategyの純粋関数を共有する。段階移行時は旧項目を読み取り専用projectionにするか削除し、二つのTickで同一在庫を更新しない。新規シナリオで新保存形式を初期化。旧形式は明示拒否。切替は全E2E通過後。既存公開ゲームを壊さない。

## スキーマ
Country(id, tag, displayNameKey, flagId, regimeId, fiscalId); Government(form, regime, values[0..1], legitimacy, coercion, cooldownUntil); Party(countryId, ideologyId, support, seats); InterestGroup(countryId, influence, satisfaction); Cabinet(role, personId, partyId); Crisis(kind, pressure, triggerDay); State(id, legalOwnerId); Province(id, stateId, controllerId, edges); POP(stateId, citizenshipId, occupation, ageBand, count); MobilizationReservation(popKey, holderId, count); Treasury(accountId, minorUnits); Debt(id, debtor, creditor, principal, coupon, maturity); Market(goodId, regionId, price, prevOfferedPerDay, prevRequestedPerDay); Inventory(ownerId, locationId, goodId, quantity); TradeShipment(id, seller, buyer, route, escrow, quantity, status); Factory(id, stateId, operator, type, damage, IC); Construction(id, priority, remainingIC); ProductionLine(id, factoryId, revisionId, efficiency, WIP); DesignRevision(id, chassis, modules, frozenStats, IC, materialRecipe); ResearchProject(id, RP, prerequisiteIds); MIO(id, domain, experience, traits); Division(id, countryId, manpowerReservation, lots, org, hp); Plan(id, revision, assignedDivisionIds, priority, authorization); AirWing(id, baseId, revisionId, pilots, mission); Occupation(stateId, occupierId, policy, resistance, compliance); Focus(countryId, focusId, progress, effects); Modifier(sourceId, target, key, value, expiry).
すべて参照整合・人数整数・資金最小単位整数・有限値・物量非負。国号はIDを変更しない。地域POPの合計から国別集計を導出。合法所有と実効支配・操業権は別。通貨は初期単一決済単位、複数通貨/FXは別変更。

## 数式（初期仮説、実測後調整）
- 会計: cashNext=cash+receipts-payments; 国債発行は貸し手現金→国庫、元本は対称な債権債務。返済・利息・債務再編を明示。売買は実数量×価格を1回決済。税・政府調達に同一費用を二度計上しない。
- 市場: offer/demandは同じgood/day。target=base*clamp(sqrt((D+eps)/(S+eps)),0.25,4); next=0.8*prev+0.2*target; D=S=0では前値維持。売注文は在庫で上限。資源採掘と消費・輸送ロスの台帳を追加。固定バスケット指数の前月比をインフレとして扱う。輸送中は販売/消費不可。禁輸・制海権で出荷と配送を制限。
- 建設: effectiveIC=baseIC*(1-damage)*workerFill; progress=min(remainingIC,allocatedIC,cash/costPerIC,material/recipe); 0分母の制約は非適用。資材を消費する時点で作業を記録。修理は損害差分に比例し同日修理と後続爆撃を相殺しない。
- POP: N'=N+birth-death+immigration-emigration; 移動はfrom/to同数。失業→予備→労働者→許可時のみ技術者、復員→訓練・就業。workerFill=min(1,workers/needed)（needed=0は1）。現役0なら戦力0。実人口0で架空研究・産出を生成しない。教育・再雇用・援助で回復し、回復の保証ではない。
- 政治: 支持率は重み正規化、議席は選挙時のみ最大剰余法で整数配分。利益集団影響力と支持率は別。民主制の実行は法定賛成議席/信任、独裁制は権限・忠誠・行政能力で判定。pressureNext=clamp(pressure+(grievance-legitimacy*0.4-eliteLoyalty*0.3)*0.02,0,1); 0.8以上30日かつ危機条件、冷却180日（暫定）。乱数はシード派生、同一危機一回。
- 生産: effectiveIC=allocatedIC*efficiency; 材料制約は実予約量のみ一度。WIPは当該revision専用、未完成資材の保存を明文化。effNext=eff+k*(cap-eff) (実稼働時のみ); 切替効率=clamp(floor+(old-floor)*commonRatio,floor,cap)。兵器型番固定、研究だけで既存装備は変化しない。
- 研究: RP=researchers*education*literacy*infrastructure*k; slotsは並行数、RP_i=RP*weight_i/sumWeights; ahead=min(5,1+0.75*y+0.15*y*y); MIOと機関bonus合計最大30%（初期値）。0研究員なら0RP。
- 戦闘: raw=SA*(1-hardness)+HA*hardness; attack=raw*terrain*weather*supply*doctrine*(1+planning); hits6h=0.012*(0.15*min(attack,defPool)+0.55*max(0,attack-defPool)); 装甲補正は一度。両軍同一snapshotで計算。戦闘幅・燃料・補給・組織率で実参戦可能数を制限。損耗は原因別で残存量上限。非戦闘故障期待値=quantity*(1-reliability)*exposure*k*dt。航空出撃=min(ready, pilots, fuel/cost, baseThroughput, missionCapacity); 任務別配分・迎撃・CAS・爆撃は同一出撃を重複使用しない。
- 占領: Rtarget=clamp(15+0.25*(100-C)+10*war+grievance+policyDelta-18*coverage,0,100); Rnext=R+0.04*(Rtarget-R); Cnext=clamp(C+0.09*(1-C/100)*policyFactor*coverage*(1-R/125)-max(0,R-60)*0.003,0,100); 工場/資源は支配持分と実操業可能量以下。駐屯は排他人員・装備を消費。

## Tick
現行1日tickを維持し、内部6時間戦闘サブステップをまず導入（将来必要な局地戦のみHourly）。日次: command→前日snapshot→政治予算・市場約定→採掘/建設/生産/研究→補給配分/AI提案→4回の同時戦闘→占領・損耗・事件→保存則監査→commit。価格は前日需給。生産品と新規工場・政策・損害は翌日利用。週次: POP移動・AI戦略・支持率。月次: 債務・インフレ・出生/死亡。危機判定は日次。入力順に依存しないID順と整数配分、PCG32。実行時間ではなく決定論的作業量で打ち切る。
## 性能・運用
region graph CSR/隣接配列、Map索引、dirty revision、補給多始点Dijkstra、容量制約別配賦。AIは候補8・1000評価・32経路・16命令/日を初期予算、ローテーション。手動>軍団明示>軍集団>戦域、承認/戦争/所有/経路revisionを再検証。2,000 provinces / 500 divisions / 20 fronts / 5 nations 日次p95 50msは既存目標で未計測。長期1/5/10年、戦争/平和/禁輸/総動員/空襲/財政破綻。保存則エラー0、NaN0、同一seed同一hash、セーブ再開一致。CPU・メモリ・セーブサイズ計測。エラー時未確定delta破棄。UIに不足要因・政策効果・戦闘トレースを表示。
## 今回の実装境界
入力の有限性・整数性と決済の過剰丸めを修正。365日有限資源枯渇試験は経済均衡の証明ではない。以下の仕様は移行目標であり未完了項目はtasksに明記。