# Phase 6B 詳細設計

## 所有権と状態
- resource: GoodDef{id,unit,basePrice,category}、Deposit{province,goodId,capacity}、BuildingDef{id,inputs,outputs,workers}。pack固定、ID参照と非負有限値を検証。財カタログの例: 食料、消費財、鋼材、燃料、歩兵装備、火砲、支援装備。追加はシナリオにより決める。
- production: BuildingInstance{province,type,level,condition,methodId,priority}。所有と稼働は現在支配・損傷・法律で決定し、建設は建設システムが更新する。軍需ラインはPhase6Aと共通の在庫サービスに入出庫を申請。
- population: 人口、民間労働力、軍人、募集中予約人員を区別。必要労働人数は産業レベルと生産方法から算出。徴兵可能人口を労働需要と二重計上しない。徴兵人員の増減はpopulationが管理し、軍事側で人口を直接増やさない。
- economy: 国別/財別自由在庫・価格・需要と実消費、輸出入、貨幣台帳。予約済み在庫は売却不可。軍需工場の増設費と維持費、民需の不足を生活水準/支持率へ接続。

## tick順序と競合
1. コマンド検証・戦闘消耗・建物稼働能力更新。日次開始前から保有する在庫と労働力上限を確定。
2. 各産業/軍需ラインの投入・労働需要を計算。priority降順、国内の安定ID順で割当。投入品の充足率と労働充足率の最小を稼働率とする。複数投入財は必要量に対する最小比を採用し、実際の消費量は稼働率比例。未使用の割当は消費しない。
3. 全産業の出庫を適用し、実産出は同日末にまとめて入庫。生産された財を同じ産業工程で再投入せず、循環増殖を防ぐ。基礎資源の採取はdeposit容量と労働に基づく明示的な一次産出例外であり、投入なし産出の一般ルール禁止を回避する架空資源生成ではない。
4. 装備配分/訓練/建設/民間消費を確定。建設の当日資材・労働は工程2の配分で予約済みとし、ここで二度消費しない。民間最小消費量は工程2開始時に国のpolicy優先度に従う配分案件として加え、実消費はここで確定。Phase6Aの補充と募集優先度を尊重。民間財を軍需へ転用する場合は明示的な国別優先度。建設費用の貨幣と必要財は別台帳で扱う。
5. 月次価格更新、貿易、GDP。取引数量=min(輸出可能自由在庫、輸入需要、輸送容量、支払可能量)。価格は既存clamp範囲から変更しない。戦争・禁輸・条約を評価し、合意倍率は容量の一要因とするが実在庫/支払上限を超えない。受渡しと支払を同時確定。
6. 生活水準、雇用、税収/財政、支持率、スコア更新。労働不足→産出低下→不足→生活水準低下という因果をUIトレースで説明。時間差は日次/月次を明示。

## 数値・移行
生産原単位、労働率、貿易容量、価格弾性は仮のゲーム調整値としてpackに定義。実データを使う際は出典・時点・ライセンス・品質を記録。国家人口の統計量とゲーム用調整値を分離。旧4財から一対一ID移行し、端数・在庫・貨幣・予約・産業数を保存。追加財の初期値はpackに明記。未実装財を実在値で埋めたと主張しない。

## 性能と異常系
全国家×財×ラインの毎tick全探索を避ける。国/財/州index、dirty更新、台帳日次集約。測定は既存Tier S/Mと世界版候補の合成データで行う。爆発的発散、NaN、負値、貨幣消失、在庫重複を50年複数seed・property・障害注入で確認。旧世界の結果が同一になるとは限らず、セーブ直後の保有資産一致と新版の決定論を受入条件にする。


## 実装契約（詳細）
横断契約: docs/20-Phase5-6横断実装契約.md。6Bは6Aの在庫APIを拡張（第二の財ストアを作らない）。
- GoodDef: id、unit、basePrice>0、category、quantityKind:continuous/discrete。原材料/民需はcontinuous、装備はdiscreteの払出単位（損耗・旧小数在庫は保持）。定義ID一意。価格・数量は有限、未知財・単位変換・負値は拒否。
- Deposit: provinceId/goodId/capacityPerDay/workersAtFull。稼働率の上限は1、支配国なし・占領移行中・稼働不能は0。採取量=capacity×condition×laborFill、0労働必要量の場合は明示した自動産出定義のみ。6Bは枯渇なし、後続が拡張。産地・初期在庫・基準値にはsource/year/license/quality（game-assumptionを含む）を付与。
- BuildingInstance: id/provinceId/typeId/methodId/level/condition(0..1)/priority(0..9)。国帰属はcontroller、ownerと区別。建設中は稼働0。工場能力は完成済レベル×conditionのfloorを国別合算、同施設の能力を普通産業と軍需で二重算入しない。建設完了・支配変更後の次の日次能力確定から割当可能。工場の建設/損傷はconstructionが管理。
- 労働: workingAgePool=floor(人口×pack労働可能率)、軍務人員(M)=生存軍人＋募集予約人員、民間利用可能=max(0,workingAgePool−M)。新規予約可能人員は法律・軍務上限の未使用分と民間利用可能量の最小以下。旧manpowerPoolを人口と無関係に生産で増やさない。現実の人口構造との差はゲーム設定。自然減や領土移転で上限を下回る既存軍人を即消滅させず、新規募集を抑止し不足を表示。解隊/返却は生存人員のみ。戦闘損失・人口死亡・人口移動は一元イベントで一回だけ人口反映する。旧productionの人口×0.05%/月の日次加算とpopulationの徴兵加算を両方廃止し、populationの日次計算に統合。
- 労働の配分は日次一時予約。自由人員の徴兵予約と競合する場合は軍務予約を先に計上した上で産業労働を確定。産業で消費しない労働は当日解放。新規募集が日末に成功しても翌日の民間供給から控除する。
- 生産: 安定順は国ID昇順/priority降順/施設種別固定順(deposit,industry,military,construction,civilianConsumption)/id昇順。各案件の fullInput, fullWorkers, fullOutput は当日開始時点のレベル/効率/法律/技術で計算。稼働率=min(1,全財free/fullInput,残労働/fullWorkers,conditionFactor)（分母0は比1）。conditionを能力側で適用済ならconditionFactor=1とし二重適用禁止。直後に実投入=fullInput×rateを予約・消費、労働=fullWorkers×rateを割当。後続は残量を使用。産出は全案件完了後に一括入庫。軍需の効率適用は6Aの式と整合。消費財・建設・民需向け最低確保は国別優先度とするが同一予算を重複使用しない。

### 経済・コマンド
| type | payload | 条件 |
|---|---|---|
| setIndustryMethod | buildingId, methodId | 自国支配、適合・解禁 |
| setIndustryPriority | buildingId, priority | 自国支配、0..9 |
| setIndustrialPolicy | militaryPriority, civilianPriority, constructionPriority | 各0..9、明示的優先度 |
| setTradePolicy | goodId, exportEnabled, reserveMinimum | 既知財、有限非負 |
| startIndustrialConstruction | provinceId, buildingTypeId | 自国支配、建設枠・費用・技術 |

価格: 需給ゼロ双方は前月価格維持、需要>0供給0は基準価格×4を目標、需要0供給>0は基準×0.25を目標。他は base×sqrt(demand/supply) をclamp。旧平滑係数をコード監査で固定しテストする。取引価格は両国価格平均、量=min(残輸出可能量,残輸入需要,残輸送容量,買い手現金/価格)。discreteの取引はfloor。条約補正は輸送容量にのみ適用し、他の上限を超えない。資金・数量移転を同時確定し、取引の度に残量更新。旧tickTradeの部分支払による過大受渡しは廃止。月次価格/貿易の順序は維持。輸送容量の未実装時はpackに仮容量を定義し、海路の実在性はPhase8まで主張しない。
貨幣はtreasury/householdPoolおよび明示口座間の移転とする。全世界の貨幣総額差が0（許容差内）。GDPは貨幣残高とは別の期間流量、二重計上しない。実産出の付加価値=産出評価額−中間投入額、サービス推計は独立項。貿易は在庫移転でありGDPへ総取引額を足さない。生活水準・支持率は実消費充足を入力とし、価格/雇用の変化はトレース可能。旧式の係数は暫定維持し、変更前にfixture比較と調整値を確定する。
- 国家消滅・支配喪失・建物破壊: 既存保有と途中予約を暗黙に他国へ移さない。占領時に土地固定施設の支配だけ移る。財在庫は国単位のため土地取得で移動しない。資産消失を台帳の明示的損失として記録し、貨幣は消滅ルール（既存保存則維持）を別途テスト。
