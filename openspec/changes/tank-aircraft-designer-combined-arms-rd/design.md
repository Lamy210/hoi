# DESIGN-01 詳細設計：兵器デザイナーと陸空戦闘・研究/MIO

## 0. 契約・単位・既存ルールとの接続
- 既存main 97caeb8（PR #55）: strategy/Design はカテゴリと攻防・装甲・貫通・信頼性・ICの「最終値」、Lot は modelId/holder/quantity、Line は modelId と稼働IC、Research は国別RPで、参照Tickは独立している。本設計は既存最終値を廃止せず、「設計版から一回だけ生成するキャッシュ」として扱う。設計後に同じ数値をMIO/技術で再乗算してはならない。
- 旧WorldState側の自由編制・production・researchは別コードパス。勝手に統合せずINTEGRATION-01で新ルールへ切替する。旧v18セーブの後方互換は不要、新保存形式での復元/ハッシュは必須。
- 1 Tick=1日、戦闘サブフェーズ=6時間×4。陸戦/空戦とも参照データはフェーズ開始時に固定。空戦結果は当該サブフェーズの空軍支援に使い、当日末に施設破壊を書き、施設IC/物流の損害は翌日に反映。
- 単位: IC=1装備当たり累積生産能力、重量t、速度(戦車)km/h・(機体)km/h、航続距離km、燃料unit/6h、能力ポイントdimensionless、信頼性R∈[0,1]。ゲーム上の仮値で実物の兵器性能ではない。比較は同年代・同技術のカタログ内で行う。
- 全数値は balanceCatalogVersion='design-balance-v1' の初期PoC用値。リアルHoI4の実装式・数値ではない。固定小数(1e-6)で比較し、予期しない非有限/負値は拒否する。

## 1. スキーマ（永続/派生の境界）
| 型/正本 | 主キー/必須属性 | 参照制約と所有権 |
|---|---|---|
| ModuleDefinition | moduleId, version, family, slot, allowedChassisKinds, unlockTechId, massT, ic, complexity, resourceCosts, statDeltas, tags | カタログに固定。1スロット1部品、相互排他、tech unlock |
| ChassisDefinition | chassisId, category=light/medium/heavy/superheavy, year, massT, maxRatedMassT, baseSpeed, baseArmor, baseReliability, baseIC, complexityBudget, slotCapacities | 国別研究前提、シャーシ強度と設計制約 |
| AirframeDefinition | frameId, size=small/medium/large, year, emptyMassT, maxTakeoffMassT, baseSpeedKmh, baseRangeKm, baseAgility, baseReliability, baseIC, maxWeaponMassT, engineCountRange, slotCapacities | frameの任務適性/搭載可能重量 |
| DesignRevision | designId, revision, countryId, type=tank/aircraft, chassisOrFrameId, moduleIdsBySlot[], designerMioId?, catalogVersion, frozenStats, createdTick, techSnapshotId | 不変。変更は次revision/新modelId。実在部品のみ・順序正規化 |
| EquipmentDesign（既存） | modelId, category, frozenDesignRevisionId, soft/hard/defense/breakthrough/armor/piercing/reliability/IC, resources | final statsは設計版から導出、既存LotのmodelIdと一致 |
| ProductionLine（既存） | lineId, countryId, modelId, factoryId, efficiency, carryIC, productionMioId? | 型番切替は明示コマンド。MIO量産補正はライン生産にだけ適用 |
| EquipmentLot（既存拡張） | modelId, holder=warehouse/division/garrison/airwing/transit, holderId, quantity | 1ユニットは必ず1バケット所属。紛失はloss ledger、修理は在庫移転 |
| DivisionTemplateRevision | templateId, revision, battalions[{type,modelGroup,width,requiredQty}], support[], doctrine | 各師団はrevisionを固定参照 |
| AirWing | wingId, countryId, airbaseId, modelId, planesReady, planesRepairing, reservePoolRef, pilotCount, mission, targetAirRegionId, sortiePriority, avgExperience | airframe・pilot・fuel・airbase・距離・任務が実在 |
| AirRegion/Airbase | airRegionId, provinceIds, radarCoverage, weatherId / airbaseId, provinceId, capacity, damage | 一基地で使う機体数が基地容量を超えない |
| MioOrganization | mioId, countryId, specialization, xp, unlockedTraitIds, pendingAssignments[], maxConcurrentTasks, revision | XPは帳簿正本。traitDAG、国別所有、国策grant以外free unlock不可 |
| ResearchTechDef / Project | techId, branch=foundation/module/air/doctrine, prereqIds, year, costRP, unlockModuleIds / countryId, allocatedPriority, progressRP, usedBonusTokenIds, mioId? | DAG、bonusTokenは原子的消費、同一技術二重研究禁止 |
| BonusToken | tokenId, countryId, source=focus/espionage/decision, category, expiryTick?, yearDiscount<=2, speedBonus<=0.2, consumedByProjectId? | 使い捨て・同時割当不可。スパイ活動の実装前は任務成功イベント由来のみ |
| AirMissionSnapshot | tick, subphase, wingId, effectiveSorties, detection, airBattleLoss, aaLoss, nonCombatLoss, fuelSpent, targetId | 診断派生ログ。active機数以外から戦力を生成しない |

設計revisionの内容ハッシュは昇順moduleIds+catalogVersion+所属国+設計MIO snapshotを入力として計算。設計自体の変更で既存ロットを一括変換しない。該当revisionの削除/再使用は禁止（参照中は完全に保持）。

## 2. 戦車デザイナー（選択スロット・カタログ）
| Chassis | 基礎mass t | 許容mass t | 基礎armor | 基礎speed | 基礎R | 基礎IC | 複雑度予算 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 軽 | 10 | 18 | 15 | 42 | .94 | 6 | 6 |
| 中 | 16 | 30 | 25 | 36 | .93 | 10 | 9 |
| 重 | 26 | 50 | 45 | 28 | .92 | 17 | 12 |
| 超重 | 55 | 90 | 80 | 17 | .89 | 30 | 14 |

必須スロット: chassis×1、gun×1、turret×1、engine×1、armor×1。special は軽2/中3/重4/超重4まで。全スロットはカタログ上の互換表で制限。初期値（攻撃力・質量・コスト）:
| パーツ | mass t | IC | 複雑度 | 主要効果 | ΔR |
|---|---:|---:|---:|---|---:|
| 対人砲 | 1.5 | 3 | 2 | SA+30, HA+6, AP+15 | -.010 |
| 対戦車砲 | 2.0 | 4 | 3 | SA+8, HA+28, AP+75 | -.025 |
| 汎用砲 | 2.0 | 5 | 3 | SA+20, HA+20, AP+50 | -.025 |
| 1人砲塔 | 1.0 | 1.5 | 1 | 火力×0.85, BT+0 | .000 |
| 2人砲塔 | 1.8 | 2.5 | 2 | 火力×0.95, BT+3 | -.010 |
| 3人砲塔 | 2.5 | 3.5 | 2 | 火力×1.00, BT+7 | -.020 |
| ガソリン | 1.6 | 2.8 | 1 | power=280 kW, fuel×1.10 | -.015 |
| ディーゼル | 2.0 | 3.2 | 1 | power=250 kW, fuel×0.85 | .000 |
| ガスタービン | 3.0 | 6.0 | 3 | power=440 kW, fuel×1.55 | -.075 |
| リベット装甲 | 2.0 | 2.0 | 1 | armor+15, slope×1.00 | -.010 |
| 溶接装甲 | 3.0 | 4.0 | 2 | armor+25, slope×1.00 | +.005 |
| 傾斜装甲 | 4.0 | 5.5 | 3 | armor+30, slope×1.22 | -.020 |
| 無線機 | 0.2 | 1.4 | 1 | BT+2, initiative+0.05 | -.005 |
| 増槽 | 0.5 | 1.1 | 1 | operationalRange×1.20 | -.010 |
| 増加装甲 | 2.0 | 2.6 | 1 | armor+15 | -.025 |

演算順は必須パーツ検証→装備研究解禁→互換/slot/質量上限→原始能力値→MIO設計補正→固定設計版。式:
- MassT = ChassisMass + ΣModuleMass（ハード制限 MassT<=1.30×RatedMass、超過は設計拒否）
- RawComplexity = ΣModuleComplexity; Overflow=max(0,RawComplexity-ChassisBudget)
- PowerWeight = EnginePowerKW / MassT [kW/t]
- SpeedKmh = clamp(ChassisSpeed × sqrt(PowerWeight/12), 5, 80)
- FuelPer100km = (0.06×MassT+0.0015×EnginePowerKW)×EngineFuelMultiplier。TankOperationalRangeKm = 400×(1+SpecialFuelRangeBonus)/EngineFuelMultiplier。燃料が不足した戦車は移動/攻撃を制限する。速度と燃料を無関係にして無償の高速化を許さない。
- Armor = clamp((ChassisArmor+ArmorModule+SpecialArmor)×SlopeMultiplier,0,250)
- SoftAttack = GunSA × TurretAttackFactor + ΣSpecialSA, HardAttack 同様
- Piercing = GunAP + ΣSpecialAP; Breakthrough = BaseBT(chassis:軽6/中9/重14/超重20) + TurretBT + SpecialBT + 0.10×Armor
- Reliability = clamp(ChassisR + ΣModuleDeltaR + MIODesignDeltaR −0.04×Overflow −0.10×max(0,MassT/RatedMass−1), 0.35, 0.98)
- IC_perUnit = round2((ChassisIC+ΣModuleIC)×(1+0.03×Overflow)×(1−MIODesignCostDiscount)); discountは0..0.15
- Resources_perUnit = ChassisResourceBill+ΣModuleResources（カタログ定義、通貨/ICから自動生成しない）

初期実例（中戦車＋汎用砲＋3人砲塔＋ディーゼル＋傾斜装甲＋無線機）:
Mass=16+2+2.5+2+4+.2=26.7t; Complexity=3+2+1+3+1=10, Budget=9, Overflow=1;
Speed≈36×sqrt((250/26.7)/12)=31.8km/h;
Armor=(25+30)×1.22=67.1; SA=20, HA=20, AP=50, BT=9+7+2+6.71=24.71;
R=.93−.025−.02−.02−.005−.04=.820; IC=(10+5+3.5+3.2+5.5+1.4)×1.03=29.46。
この型を安価な軽戦車・高価な重戦車と比較し、火力のみで全シナリオ優位とならないことをPoCで確認。

## 3. 航空機デザイナー
| Airframe | 空虚質量t | 最大離陸質量t | 基礎速km/h | 航続km | 基礎機動 | R | IC | weapon payload cap t | engineCount |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| small | 2.5 | 6 | 470 | 650 | 90 | .92 | 8 | 1.5 | 1..2 |
| medium | 6 | 16 | 410 | 1200 | 55 | .91 | 16 | 5 | 2..4 |
| large | 14 | 35 | 350 | 2100 | 28 | .90 | 28 | 12 | 2..6 |

必須: frame×1、engine×1（engine.countがrange内）、1つ以上の有効任務用armament。weapon slot small2/medium3/large4、special small2/medium3/large4。engine typeは reciprocal/jet。推力を「モデル内の推力ポイント」で扱い、比を正規化する（実物kNと混同しない）。初期モジュール:
| パーツ | mass t | IC | ΔR | 主要効果 |
|---|---:|---:|---:|---|
| レシプロエンジン（1基） | .8 | 3.5 | -.010 | thrust+60、complexity+1 |
| ジェットエンジン（1基） | 1.6 | 7 | -.055 | thrust+110、complexity+3、要jet tech |
| 機関銃 | .2 | 1.8 | -.005 | airAttack+8、payload+.2、drag+.03 |
| 機関砲 | .4 | 3.0 | -.015 | airAttack+18、agility−8、payload+.4、drag+.06、complexity+2 |
| 爆弾倉 | 1.2 | 4.5 | -.025 | groundAttack+14、strategicBomb+18、payload+1.2、drag+.15 |
| 魚雷 | 1.0 | 4.0 | -.015 | navalAttack+24、payload+1.0、drag+.12 |
| ロケット | .5 | 3.0 | -.020 | groundAttack+16、airAttack+3、payload+.5、drag+.08 |
| 増槽 | .5 | 1.5 | -.010 | rangeBonus+.40、agility−6、drag+.08 |
| 防弾/自己密閉タンク | .4 | 2.0 | +.015 | airDefense+12、agility−3、drag+.02 |
| レーダー | .2 | 2.0 | -.005 | detection+0.15、agility−3、drag+.04 |
| 急降下ブレーキ | .2 | 1.4 | -.010 | CASAccuracy+0.15、speed−5%、drag+.06 |

Jetと高度なレーダーは研究で解禁。機関砲、レーダー、爆弾倉を空のスロット無制限に積むことは禁止。重量・出力・武装搭載量が不足なら設計登録不可。

- Weight = FrameEmptyMass + ΣmoduleMass×count、WeaponMass = ΣweaponMass×count
- Thrust = ΣengineThrust×count、ThrustRatio = Thrust/(12×Weight)。ThrustRatio>=1.0、Weight<=frameTakeoffMax、WeaponMass<=payloadCap、engineCount範囲を必須。
- Drag = 1+ΣdragDelta (>0)
- Speed = clamp(FrameSpeed×sqrt(ThrustRatio/Drag)×(1−DiveBrakeSpeedPenalty),100,1200)
- Agility = clamp((FrameAgility+ΣagilityDelta)×min(1.25,ThrustRatio)/(1+0.10×WeaponMass/PayloadCap),5,150)
- Range = clamp(FrameRange×(1+ΣrangeBonus)/(1+0.10×(Drag−1)),100,10000)
- AirAttack=ΣmoduleAirAttack、AirDefense=FrameBaseDefense+ΣmoduleAirDefense、GroundAttack=ΣmoduleGroundAttack、StrategicBomb=ΣmoduleStrategicBomb
- Reliability=clamp(FrameR+ΣdeltaR−0.035×max(0,Complexity−FrameComplexityBudget)−0.07×max(0,1.10−ThrustRatio),0.35,0.98)
- IC=(FrameIC+ΣModuleIC)×[1+0.03×max(0,Complexity−Budget)]×(1−MIODesignDiscount)
- complexityBudgetは small6 / medium10 / large14。武器が0の空戦/地上任務、魚雷のない雷撃、strategicBomb=0の戦略爆撃などは任務不可。

例: small + レシプロ単発 + 機関砲 + レーダー + 増槽:
Weight=2.5+.8+.4+.2+.5=4.4t; ThrustRatio=60/(12×4.4)=1.136;
Drag=1+.06+.04+.08=1.18; Speed≈470×sqrt(1.136/1.18)=461km/h;
Range≈650×1.40/(1+.018)=894km; AirAttack=18; BaseR .92−.01−.015−.005−.01=.880; IC=8+3.5+3+2+1.5=18.0。
同型から増槽を外すと範囲は短くなり、重量と抗力が下がって機動力が上がる。戦闘機と長距離護衛の使い分けを成立させる。

## 4. 信頼性・故障率／非戦闘損耗
戦闘損害・対空撃墜・非戦闘故障を区別する。故障は保有ロットから実際に引き落とす。各6時間サブフェーズに有効な活動装備数Nで:
p_6h = clamp(p0 × [(1−R)/0.10]^1.5 × W × Terrain × Distance × Maintenance, 0, 0.05)
- p0: tank 0.0004 / aircraft 0.0006（航空機は実出撃機に限る）。
- W: 快晴1、雨1.4、雪1.7、悪天候中間1.8、嵐2.3。地上移動中は泥濘2.0、山岳1.6、砂漠1.5、通常1。航空機Terrain=1。
- Distance: 戦車 1+0.4×max(0,TravelDistanceKm/100−1)、上限2.0。航空機 1+0.5×max(0,MissionDistance/DesignRange−0.6)、上限1.2。航続圏外は sortie拒否。
- Maintenance: 平時整備0.8、標準1、燃料/補給不足1.5、包囲/拠点損傷2.0。倍率は一回だけ掛ける。
- 各entity/day/subphase/causeをPCG32派生シードにして Expected=N×p から整数損失 = floor(Expected)+Bernoulli(frac(Expected))。同サブフェーズの実損失はN以下。中間計算はdoubleで構わないが、確率ソート・seedは固定。発生理由を保有ロット上のlossLedgerで一度だけ引き落とす。
- 同一の機体が air-to-air loss / AA loss / noncombat loss の複数対象にならないよう、生存航空機を順次減らす。故障機はdestroyedとrepairableに分けてもよいが、回復可能分はrepairing bucketに移し工業IC/部品を支払わない限りreadyへ復帰させない。現段階の参照計算では全件を廃棄とする。
- 例: R=.80、悪天候W1.8、泥濘2、長距離1.3、整備1 → p=0.0004×(2^1.5)×1.8×2×1.3≈0.00529/6h（約0.529%）。高信頼R=.95なら約0.066%。6h×4日の損耗は逐次残数を使い、初期数N×4pで一括計上しない。

## 5. 陸戦：師団幅、編制、装甲/貫通
| 大隊 | width | 主戦力 | 初期補給需要(相対) |
|---|---:|---|---:|
| 歩兵 | 2 | SA / defense / ORG | 1 |
| 砲兵 | 3 | SA、低ORG、火砲在庫 | 2 |
| 戦車 | 4 | HA / breakthrough / armor / hardness / fuel | 3 |
支援中隊width0だがICと補給需要を持ち、同一種類最大1、最大5種。地形別戦闘幅: 平野80、森林70、丘陵70、山岳50、都市60。各師団の width = ΣbatWidth。前線の攻撃・防御それぞれ容量を持ち、参加師団は決定論的に優先度/ID順で投入。超過師団は予備へ回し、その6hは攻防しない。全師団が容量を超える場合のみ最初の1師団を投入し widthPenalty=clamp(Capacity/Width,0.60,1.00) を一度適用する。戦闘幅0の空編制は禁止。

師団能力値の算定:
- B_i=大隊数×編成定義の基礎値× manpowerFill_i× equipmentFill_i（装備のモデル毎のstatは配備済Lotから取得）。
- DivHardness = clamp(Σ width_i×hardness_i /Σwidth_i,0,1)。騎兵/歩兵に単独1両の戦車を加えても100%装甲にはならない。
- DivArmor = Σ(width_i×armor_i×equipmentFill_i)/Σwidth_i。装備0の装甲は0。
- DivPiercing = 0.70×max_i(piercing_i×equipmentFill_i)+0.30×Σ(width_i×piercing_i×equipmentFill_i)/Σwidth_i（対戦車砲大隊の効果を残す）。
- 機材モデルのsoft/hardを合算した後、terrain/weather/leadership/supply/doctrine/air superiority/plan をカテゴリ別一度だけ適用。幅ペナルティも一度。
- RawAttack = SA×(1−TargetHardness)+HA×TargetHardness。DefPoolは防御側Defense、攻撃側Breakthrough。
- ExpectedHits_6h = 0.012×[0.15×min(EffectiveAttack,DefPool)+0.55×max(0,EffectiveAttack−DefPool)]（前回基盤と同形式）。
- 基準ダメージ OrgLoss=2×Hits, HpLoss=.25×Hits、両方とも0以下へ行かない。

装甲判定（要求仕様の明確化）:
- 受け手のDivArmor > 攻撃者DivPiercingなら ArmoredProtection=ON。該当受け手へのland hits起因のHP/ORG被害を×0.50。等号以上貫通ならボーナスなし（境界で不連続なのでUIに計算根拠を示す）。
- 攻撃側にArmoredProtection=ONが成立した場合、その攻撃側が敵に与えるORG損害を×1.20。これは「装甲側の組織率を増加」ではなく「装甲優位の敵への組織率ダメージ増加」。片側ごとにON/OFFを判定し、他のカテゴリで繰返し増幅しない。
- 例: 攻撃側AP=40、受け手Armor=70の場合、受け手の陸戦HP/ORG損害=基準×0.5、装甲保護側の敵ORG損害=基準×1.2。CASには独立の対地貫通と地対空判定を用い、陸戦の装甲保護による半減を再利用して二重適用しない。
- 損耗は同時スナップショットで計算、各sideの生命・装備在庫を結果確定時一回だけ減算する。0ORG部隊は撤退状態、0HPは壊滅、同サブフェーズの二重参加は禁止。後続の人口/占領は戦闘完了後に更新。

## 6. 航空ミッションと陸空統合
任務は air-superiority / interception / close-air-support / strategic-bombing（将来 naval-strike / recon）。指揮官はwingと任務/空域/基地を指定。要求: 研究済み設計版の機体、在庫から配備済みのready機数、実乗員・燃料・基地容量・航続距離内・敵味方の戦争/領空権限を満たす。平時にCAS/戦略爆撃しない。AI側も手動固定/承認を再検証。

1日4×6hサブフェーズの順序: (1) 出撃可能数・航続距離・燃料・天候でsorties予約→(2) detection/迎撃と空対空損失→(3) surviving bomber/CASにAA対空損失と任務妨害→(4) surviving fightersによる制空指数→(5) CAS陸戦追加損害→(6) 戦略爆撃→(7) 最終生存機の非戦闘故障→(8) 空域/factory/logistics dirtyと在庫収支記録。空戦・AA・故障の順序は固定。CASが陸戦開始前に存在しても同じ6h戦闘から直接損害を引かない（戦闘が存在するときだけ）。
- ActiveSorties = min(ready, pilots, availableFuel/fuelPerSortie, freeAirbaseCapacity)×weatherLaunchFactor×rangeFactor×missionAvailability（整数化、fractionは確定乱数）。distance>rangeなら0。
- Detection=clamp(0.35+0.40×radarCoverage+MIOReconBonus−0.25×adverseWeather,0.10,0.95)。
- 空対空撃墜期待値 K_aa = min(EnemySorties, 0.020×OwnEngagedFighters×sqrt(OwnAirAttack/max(5,EnemyAirDefense))×clamp(OwnAgility/EnemyAgility,0.70,1.30)×Detection)。互いの撃墜は同一「戦闘開始スナップショット」で算出してから双方へ適用（先攻有利を防止）。1機は一度しか撃墜されない。
- AA地上防空: K_groundAA=min(SurvivingHostileSorties, [0.0003×StateAAQuality+0.0008×EngagedDivisionAA]×SurvivingHostileSorties×AAReadiness)。StateAAが0/DivisionAAが0なら撃墜0。州AAは爆撃/CASに、師団AAはCASに適用。迎撃済み機体には再計算しない。
- 制空寄与 P_side=ΣSurvivingAirSuperiorityFighters×Readiness×[0.45×AirAttack/20+0.35×Agility/80+0.20×Speed/500]×RangeEfficiency。純迎撃任務はPに算入しない。
- Advantage=clamp((P_friendly−P_enemy)/(P_friendly+P_enemy+1),−1,1)。Advantage>0の場合、敵側の陸軍移動倍率=1−0.15×Adv、陸戦Defense倍率=1−0.12×Adv。同時に味方の攻撃バフを別経路で付与しない（重複防止）。戦場の当該空域に限定。
- CAS実効機数=min(SurvivingCAS×MissionEfficiency,2×GroundCombatWidth)。CASHits=min(0.20×BaseLandHits+1, EffectiveCAS×GroundAttack×0.003×(1−MissionDisruption))。CAS OrgLoss=CASHits×1.4、HpLoss=CASHits×0.25。GroundAAで撃墜されたCASはサポート不可。敵装甲に対してはCASPiercingが不足ならCASHits×0.60を一度だけ適用、land armor protectionと重複しない。
- StrategicBombDamagePoints=SurvivingStrategicBombSorties×StrategicBomb×0.0005×MissionEfficiency。対象施設の重みは明示したfactory/airbase/rail/supplyHubのみ、重複ターゲットへの配分合計がdamagePointsを超えない。∆damage=min(1−oldDamage,AllocatedDamagePoints/FacilityMaxHP)。工場/輸送網への影響は翌Tick、修理には物理IC/資金/材料を費やす。工業能力0でも生産にマイナス値は出ない。
- 戦略爆撃に伴う抵抗/国家精神/POPの直接効果を勝手に加算しない。対空砲の数値は配備済みの装備ロット・燃料/弾薬・州施設の正本から導出。

## 7. 多層技術・研究力・時代先行・研究割引
研究グラフ例:
- foundation: tank.light.1 → tank.medium.1 → tank.heavy.1（同一時代の分岐は任意。超重にはheavy unlock）、air.small.1 → air.medium.1 → air.large.1（世界観に合わせた技術DAG）。
- modules: gun.at.1 → gun.at.2; engine.diesel.1 → engine.turbine.1; prop.1 → jet.1; radar.1→radar.2; armored-fuel.1。各moduleは必要foundationとtechをANDで満たしたときのみ搭載可。
- doctrine: land.armored/land.firepower/air.superiority/air.support/air.strategic の排他選択や国家方針との関係はデータ定義。研究の中身が全師団/全機体を無償で新装備に置換しない。

研究枠（本設計のv2式。現行strategy/rules.tsの3要素算式はDESIGN-02/RND-01で変更する）:
IndustrialScore=0.40×sqrt(clamp(operatingIC/80,0,1))+0.25×literacy+0.20×education+0.15×infrastructure;
Slots=clamp(1+Σ1[score>=.30,.50,.70,.88]+FocusBonus,1,6)。
国総研究点（本設計のv2式。教育・工業力・安定度を速度へ反映し、無限成長のための研究枠乗算は不可）:
RPtotal/day=max(0.05,Researchers×0.003×literacy×(0.3+0.7education)×(0.5+0.5infra)×(0.85+0.15×clamp(operatingIC/80,0,1))×(0.75+0.25×stability))。
工場・教育・安定度の係数は有界、戦争による0割/即日無限スノーボールを防ぐ。これは既存参照実装とは異なる今後のルールであり、本PRでは実行コードを変更しない。
各枠割当 RP_j=RPtotal×PriorityWeight_j/ΣActiveWeights(上位Slots件)。枠増加でΣRP_jを増やさない。0人/経済崩壊でも最低0.05の研究点は維持（逆に無料枠/自動生産は追加しない）。
- ΔY=max(0,techYear−scenarioYear−ΣusedToken.yearDiscount)。token合計割引は年2まで。
- AheadPenalty=min(5,1+0.75ΔY+0.15ΔY²)。
- SpeedBonus=clamp(MIOResearchBonus+Focus/SpiritResearchBonus+SpyTokenSpeedBonus,−0.5,+0.3)。（技術別/国別の重複sourceIdは一意）
- ProgressRP_j += RP_j × (1+SpeedBonus)/AheadPenalty。研究完了を日末判定し、module解禁は翌Tickの新設計から有効。研究対象未解禁/国策条件未充足なら進捗0。枠縮小は優先度の低いプロジェクトを停止し進捗は保持。
- 研究割引tokenは作成時に技術カテゴリと期限を検証し、プロジェクト開始時にusedByProjectを一回だけ書く。途中キャンセルのrefundは原則なし（狙ったプロジェクトへ1回のみ使用）。spy機能がまだない場合はイベント/国家方針によるtoken発行のみ実装。

## 8. MIO（設計局/産業組織）
MIOは countryId+organizationId に帰属し、国家方針・研究完了・契約から設計/生産/研究への参入可否が決まる。1社あたり同時タスク3を初期上限。専門分野 tank/air/small-arms の不一致は割当拒否。実行結果に紐づけたXP ledgerを唯一の正本にする。
- XP/day = min(20, 1.5×sqrt(CompletedProductionIC)+0.5×ActiveResearchTasks+2×CompletedResearchEvents+min(2,0.05×ActuallySpentPrototypeIC))。設計局が受注した開発プロジェクトは実際に試作IC/資材/国庫を消費した場合だけ開発XPを得る。設計の保存・rev番号だけではXP0。待機/停止/不正研究からはXP0。複数対象が同じ生産ICをXPへ二重計上しない。
- perkコスト=20+15×UnlockedCount、最大8perks/MIO、前提DAG・相互排他・分野/レベルでロックする。
| Trait | 作用位置 | 初期効果 | 排他/上限 |
|---|---|---|---|
| speed-specialist | tank/air design snapshot | TankSpeed +8%、AirSpeed +6%、Reliability −2pt | heavy-armorと排他 |
| heavy-armor | tank design snapshot | Armor +12%、IC +10%、Speed −5% | speed-specialistと排他 |
| mass-production | production line current tick | line effective IC +10%（装備1個IC自体は変更しない） | 同グループの複数補正合計+20% |
| cost-engineering | design snapshot | IC −8%、Reliability −1pt | 設計cost discount合計上限15% |
| safety-engineering | design snapshot | Reliability +4pt、IC +5% | Reliability<=98% |
| experimental-research | research current tick | 関連技術SpeedBonus +10% | 全研究補正合計+30% |

- 設計MIOは「設計版完成時」にsnapshotし、後日MIOがlevel upしても既存在庫の能力を書き換えない。新revisionの設計を製造すれば新性能に変更できる。
- 研究MIOは日次RPの用途にのみ作用、同一sourceId/techIdの二重補正禁止。生産MIOはline effective ICへ作用し、製造した装備のfrozen IC/性能を再度変化させない。MIO効果の適用位置を毎回traceできるようにする。
- 分野XP獲得は実際の試作支出・完成IC等の実績からのみ計算。設計→未生産→割当だけでは無限XP獲得しない。試作がキャンセルされても消費済IC/資材は返さないが、未消費の予約は返却可能。

## 9. Tickパイプライン・コマンド・性能
新ゲーム参照Tick/本番接続契約:
1. 0: 事前検証/設計・研究・MIO・編制・航空ミッションコマンド確認。ルールセット/カタログ版とstate revisionを照合して拒否可能。副作用はatomic commitのみ。
2. economy-market: 旧日Quoteの価格→資金/資材/整備/生産IC予算予約。設計確定に金銭やICが必要なら資産移転として計上。
3. research-production: RP配分、MIO研究補正、型番生産・修理（実稼働IC/資源/人員）とMIO XP獲得。日中研究解禁は本日の既存機体に波及しない。
4. supply-movement-delegation: 実配備ロット・基地/燃料と師団幅、AI権限を確定。移動/天候/稼働装備の可否を検査。
5. combat-airstrike: 4×6hの空軍→AA→航空優勢→CAS+陸戦→爆撃→故障の順を系統的に処理。各6hで損害を一度だけ計上。
6. occupation-politics: 支配/治安/工場移管、国策/国家精神適用予約。効果は翌Tickの設計可否・運用能力へ反映。
7. commit: 国別POP/装備/燃料/部品/通貨、AirWing ready+repairing、施設破壊率の保存則、hash、原因別traceを検証しsnapshot commit。失敗は全部abort。

追加コマンド例: createTankDesign, createAircraftDesign, reviseEquipmentDesign, assignMioToDesign, switchProductionModel, createAirWing, transferPlanes, assignAirMission, cancelAirMission, assignMioToResearch, queueResearch, consumeResearchToken, unlockMioTrait。全て actorCountryId、expectedRevision、commandId（冪等）を検証。AI/GUIの直接state mutation禁止。ModelIdは保存中のlotとlineからの参照時に失効させない。

非機能: design評価O(moduleCount), battle O(battalions+equippedModels), air region sortie集約O(wingsInRegion)＋インデックス参照。毎サブフェーズ全Wing×全Regionを走査しない（dirty-index）。同じ部隊を空域2つへ二重割当禁止。catalogVersionスナップショットと不変設計版でhash/replayを安定化。seed/tick/subphase/wing-or-battle/causeごとに独立PCG32、Math.random禁止。ブラウザWebWorker稼働・SSR/API不要。100,000設計候補の一括組合せ探索を禁止し、UIは変更した1設計の差分評価のみ実施。

障害モード: 無効module、解禁不足、離陸出力不足、部品在庫不足、燃料0、戦争許可なし、base喪失、空域跨ぎ、MIOの二重割当、研究トークン二重消費、save schema差、爆撃の前倒し反映、順序依存の対空・空戦二重損失。すべて拒否/トレースへ繋ぐ。
監視: invalid_designs, research_rp_created, duplicate_loss, supply_oversubscription, air_sortie_rejected_by_reason, module_unlock_denied, mio_xp_delta, equipment_ledger_delta, phase_latency_p95, design_preview_latency。目標性能は実測後に確定。save integrity（checksummed+hash）と古いカタログの再実装/復元テストがDRに相当。ゲーム外DB/クラウド費用は不要、コスト主要因はクライアントCPU/メモリと保存サイズ。

## 10. 検証シナリオ・バランス基準・採用しない条件
- 5,000乱択された合法/非合法module構成をPoC生成。合法はすべてFinite/Positive IC・R 35～98%、違法は拒否し、同一入力・seedでhash同一。
- 戦車20種: 対歩兵/対戦車/泥濘/山岳/砂漠/燃料不足の6条件で評価。どの構成も全条件で単独トップを占めないこと（単一型式万能を反証）。重装甲は高IC/燃料/故障の代償がある。
- 航空機20種: 小型長距離増槽型 vs 増槽なしの戦闘機、CAS vs 戦略爆撃の任務適性、夜間悪天候、燃料不足、対空強度を比較。
- Combat: AP=69.9対Armor=70は半減、AP=70なら非半減。0ORG/HPの射撃禁止、width不足で予備、同時交戦で国/装備/航空隊総数収支0。
- Air: 0燃料/0pilot/圏外/平時爆撃でsorties0。迎撃後機数だけにAA・故障を適用。同一wingを2空域に配備できない。CASは戦闘不在0。爆撃施設は翌日からだけ減衰。
- Research: 研究枠2→3でも国RP合計不変。テクノロジー未完成の部品を選べない。先行2年の基本Penalty=3.1、1年token消費で1.9となり再使用できない。
- MIO: XP/day cap=20、同じライン・同じ部品二重XPなし。設計後のtrait解禁が既存機体をretroactive buffしない。
- 30/365/3650 Tickの保存則・安定性、500師団/200航空隊/20戦域の性能PoCを実装後に実測（p95目標は仮説で保証ではない）。
- 仮定のバランスを既存2026現代東アジアに無条件適用しない。moduleCatalogVersion/yearはシナリオpack別で、2026開始の技術・冷戦後兵器の導入可否は別途シナリオ設計が必要。

### 参考（設計思想の参考のみ、係数は本作独自）
- Paradox/HoI4: Plane Designer dev diary (2022-08-03): https://store.steampowered.com/news/posts/?appids=394360&enddate=1661245201&feed=steam_community_announcements
- Paradox/HoI4: MIO developer diary (2023): https://steamcommunity.com/games/394360/announcements/detail/3712711277292318357
- Paradox/HoI4: 2025 equipment cost balancing retrospective: https://store.steampowered.com/news/posts/?appids=394360&enddate=1744197892&feed=steam_community_announcements
