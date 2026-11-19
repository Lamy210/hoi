# Phase 8B 艦隊と造船設計
docs/20の横断契約を適用。すべての戦闘・移動は抽象ゲーム値。実在の艦船性能、実際の戦術、現実の航路計画は対象外。

## 艦艇と指揮系統
ShipModel{id,class,techId?,workRequired,crewRequired,inputs,abstractPower,durability,supplyDemand,rangeCost}。初期type: escort（護衛艦）、surface（主力水上艦）、submarine（潜水艦）、carrier（航空母艦）、transport（輸送船）、amphibious（揚陸艦）。初期実装はescort/surface/submarine/transportまで。carrierは船体と航空枠のみ後続解禁、航空戦力を未実装で付与しない。amphibiousは8Cで輸送容量拡張。巡洋艦/駆逐艦/フリゲート等はモデルのバリエーション。細かい武装モデルや実艦のスペックは対象外。
Ship{id,owner,modelId,taskForceId?,location,hp,readiness,crew,status}。locationは port(portId) | sea(zoneId) | transit(edgeId,progress) の排他的union。status active|repairing|mothballed|sunk。0hpはsunk、作戦対象外。乗員はpopulationの軍務人員、船員と陸軍募集を二重計上しない。
Fleet{id,owner,name,commanderId?,homePortId}、TaskForce{id,owner,fleetId?,name,mission,zoneIds[],revision,priority,state}。艦艇の所属はtaskForceIdを正とする。1艦1部隊、1部隊1艦隊、艦隊ごと最大16部隊、部隊最大64隻（初期値）。所属変更は同国・港湾在泊・任務拘束なしの全艦で原子的に実行。分割・合流は同一港でのみ。移動中の艦隊変更による瞬間移動禁止。艦隊司令官は陸軍と排他、初期戦闘修飾はなし。
## 造船・修理
ShipOrder{id,owner,modelId,portId,requestedSlots,allocatedSlots,progress,status,reservedCrew}。造船所は通常軍需工場と独立した能力プール。建設・占領・損傷が次の能力確定に反映。progressは[0,workRequired]、日産は共通産業割当に従い入力財・造船所・労働を1回消費して加算。進捗完了後に乗員予約が揃えば艦艇を港で配備。未充足時はready、無料乗員生成なし。船体建造の投入済み資源は返却せず、未消費予約のみ返却。港喪失時はpaused、占有者に自動譲渡しない。再開または中止を選択。完成艦を未完成艦として再生成しない。
修理は港のrepairSlotsを建造slotsと区別し、同じ設備が両方に計上されないようpackで専用設備を定義。修理で必要資源を消費しhpを増やし、最大hpを超えない。艦艇は同時に海上任務と修理を行えない。退役は港で明示命令、建造費返却なし、残存乗員のみ復員。
## 任務と海戦
mission: hold|move|patrol|escort|intercept|repair|returnToPort。state: idle|moving|onMission|returning|blocked|repairing。海域 graph の合法edge・gate・港湾権利、抽象行動範囲、補給状態を再検証。海域の移動進捗は日次、位置を一箇所に限定。任務区画の複数指定は実所在海域のみで当日効果を発生。海域全体に瞬間的な戦力を付与しない。
海戦は同海域・敵対状態・海戦可能な任務が成立すると開始し、船ID順の抽象集約値とseed由来乱数で同一結果。ゲーム用単一係数（power、readiness、供給、残hp）から当日損耗を計算、被害は0..残hp、撃沈時に乗員と船状態を一度だけ台帳更新。中立艦は交戦しない。敵対状態終了で戦闘解除。戦闘の詳細係数・損耗上限・退却閾値は架空fixtureでバランス調整し承認後固定、現時点では本番値未決。護衛/輸送への影響は8Cのイベント契約のみ。
海域の制海指標は自国と交戦相手の現在実働戦力から計算する0..1のゲーム値。双方0はunknown（制海権100%とはしない）。未交戦国の艦は分母に入れない。同盟艦の共有効果は明示権限（Phase10拡張）まで無効。任務と海戦結果反映後に更新、過去日の指標で当日出航を許可しない。UIは戦闘結果・損耗・指標の要因をtraceで表示。
## コマンド
createFleet{name,homePortId}, createTaskForce{fleetId?,name}, assignShips{shipIds,taskForceId}, setNavalMission{taskForceId,mission,zoneIds,expectedRevision}, moveFleet{taskForceIds,targetPortId|targetZoneId}, stopNavalMission{id}, startShipConstruction{portId,modelId,slots,priority}, cancelShipConstruction{id}, requestShipRepair{shipIds,portId}, retireShips{shipIds}。issuer所有国、同国・生存・状態・通行/寄港権・能力を検証し全件原子的。UIから戦力・損耗値を書かせない。AIも同じ契約。
## 保存・UI
造船、艦艇位置、所属、戦闘・任務・修理・乗員、端数とIDを保存。旧セーブは海軍データなしを移行し、存在しない初期艦艇を自動生成しない（新規ゲームpackの初期艦は別）。海軍タブ、艦隊バー、艦種一覧、造船所/修理/任務・海域指標・戦闘ログ、選択/停止/配属操作。海軍無効packでは理由を表示。海上戦闘は州の陸上戦闘ループと別、船を陸上Unitとして登録しない。性能は実働艦・実在海域のindexで処理し全ペア総当たりを避ける。