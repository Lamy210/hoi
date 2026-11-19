# Phase 6A 詳細設計

## 契約
EquipmentDef { id, goodId, family, generation, techId?, baseOutput, compatibilityGroup } はシナリオ固定。Goodはresource-systemの一元カタログを参照。互換は同じgroup内の許可された置換だけ。未解禁品は新規生産不可、保有済み旧型は配備/補充可能。
ProductionLine { country, id, modelId, requestedFactories, allocatedFactories, priority, efficiency, active, fractionalOutput }。工場は整数、国の稼働軍需工場を上限とする。要求と実割当を分離し、過剰時は priority降順/id昇順で縮退。停止ラインは0。新設/他family切替は効率0.1、同family別generationはmin(旧効率×0.5,0.5)、維持上限0.8、割当>0の日に+0.005、いずれも仮調整値。工場の増減は効率リセットしない。生産切替時の端数は旧modelに紐付けて保存し、新modelには移さない。詳細は下記の国・モデル単位端数規則に従う。
日次産出 = allocatedFactories × baseOutput × efficiency × lawFactor × researchFactor。Phase6Bで投入/労働充足を掛ける。整数装備は端数を繰越。0工場は産出0。国別割当を変更するのはコマンドのみ。
移行: 旧工場数F、火砲比率s→floor(F*s)火砲、残工場を歩兵。備蓄と予約はそのまま移す。旧生産比率や小数日産とは一致しないため移行時説明を表示。価格、補充、貿易、AIからの旧配列直書きは禁止へ移行。旧数値が端数なら在庫小数を失わない保有量として扱い、出庫は整数単位で可能。

## 台帳と割当
1つの在庫サービスを正とし、国/財/日/理由ごとの数量差分を記録。free（自由在庫）、reserved（訓練予約）、unit（配備装備）を区別。入 = 生産＋輸入＋返却、出 = 消耗＋輸出＋予約移動。予約→配備は全体資源を増やさない。
日次順序: コマンド(queued登録/生産割当)→戦闘消耗→生産→補充/募集への自動割当→訓練更新→経済。手動募集はqueued登録のみ、予約は割当工程で実行。補充優先/募集優先は国の設定、同じ優先度はID昇順。補充は必要量以下、互換旧型を先に払い出す（明示設定可能）。輸出可能量は自由在庫から国内需要の保留を引いた量に制限。
Phase5Bの「全量予約後訓練」を維持し部分予約はしない。補充効率は補給を尊重。中止の返却を二重化しない。日次台帳は集約し保持90日を初期案、状態に影響する端数/予約/優先順位は保存必須。

## 検証と非機能
生産/経済/補充の所有権・日次順序を一元化、同一入力再実行で決定論。貿易数量と支払の整合、非負在庫、工場上限のproperty test。50年検証に加えて工場喪失/研究解禁/旧型装備/移行のE2E。全国家×全財×全ラインの性能は実測し、dirty更新とID indexを優先する。未計測のSLOは確約しない。


## 実装契約（詳細）
横断契約: docs/20-Phase5-6横断実装契約.md。
- EquipmentDef: id/ family/ compatibilityGroup はASCII安定ID、generationは正整数、goodIdは既知財の一意な装備モデルに対応。baseOutputは有限正値。techIdのない初期モデルは利用可能。互換グループ内でも要求先が指定するallowedModelIdsに含まれること。要求はfamily/groupと許容モデル集合、実保有はmodelId別。旧式から新式への自動変換は不可。
- ProductionLine: idは国ごと単調増加のsafe integer、国ごと最大128件。要求工場は0..100000整数、priority 0..9、active boolean、効率は0.1..0.8。実割当は派生値、台帳は実割当のみを使用。停止状態の要求値は保持。停止再開で効率維持（時間による自然減衰は対象外）。
- fractionalOutputはラインでなく国×モデルに帰属する永続map。全ラインの同一モデル産出を安定ID順で合算し、旧端数と合わせ floor を自由在庫に加え、余りを端数mapに保持。切替・閉鎖しても旧モデル端数を保持。0稼働では端数の繰上げなし。上限近傍の浮動小数は横断契約の許容差で比較し、実計算は同じ演算順を維持する。
- 効率の当日値で産出計算し、日末に割当>0のラインの効率を min(0.8,効率+0.005) に更新。6Bでは実稼働率>0も条件とする。切替同一modelはno-op、同familyは max(0.1,min(0.5,旧効率×0.5))、異familyは0.1。旧文中のmin式はこの下限付き式に置換。要求工場・優先度変更で効率を変えない。工場割当は activeのpriority降順/id昇順に min(要求,残能力) を順に割当。国消滅で実割当0。
- 旧2財→新モデルはlegacy-infantry-v1/legacy-artillery-v1へ一対一対応。旧工場数Fは整数であることを検証（不正な小数を丸めて失わない）。旧ライン効率の初期値0.8、基準日産は2/0.8と1.2/0.8とし、旧2財の100%効率基準値を保持する。工場丸めによる配分差は許容し移行報告に表示。AI難易度補正は旧方式を維持して唯一の計算箇所に含める。

### コマンド
| type | payload | 成功条件 |
|---|---|---|
| createProductionLine | modelId, factories, priority | 解禁・上限・自国、lineId返却 |
| updateProductionLine | lineId, factories, priority, active | 自国ライン、値域、再割当 |
| switchProductionModel | lineId, modelId | 自国・解禁、効率更新 |
| deleteProductionLine | lineId | 自国、端数は保持 |
| setEquipmentPriority | mode:reinforceFirst/recruitFirst | 自国、次回割当から有効 |
| setEquipmentPreference | groupId, preference:oldFirst/newFirst | 既知group、自国 |

旧setProductionShareは6A以後通常経路で拒否。工場減少時に要求数を消さない。停止/不足理由をUIに表示。補充の上限は既存日次速度×補給（人力40、歩兵25、火砲5の旧基準を維持し、他装備はcatalog定義。新式モデルの補充速度と互換群を同時に確定）。補充可能な unitId昇順、モデルの優先はgeneration昇順または降順＋id昇順。募集は一括予約可能か全財を検証し、失敗時は何も予約しない。補充と募集は選択したmodeの順序。旧combat.ts内の直接補充をこの工程へ移す（併存禁止）。人員はpopulationとの単一窓口を使用し、6B前も同一tick内に二重引当しない。
輸出保留: 国内で当日未充足の補充需要と未予約募集需要を合算して自由在庫以内で保留する（予約そのものではない）。モデル割当と同じ優先順で保留を割り当て、同一在庫を複数groupで重複保留しない。輸出可能=max(0,free−保留)。在庫差分の唯一の書込窓口を設け transfer(from,to,qty,reason) と produce/consume を原子的に実行。負値拒否。内部移動は国全体の資源総量を変えない。海外取引は両国と貨幣の同時確定。
台帳の集約軸はtick/country/model/reason/fromBucket/toBucket、90日保持は観測用（切り捨てても将来挙動不変）。日次開始/終了の残高と差分を突合し、差異を検出したtickは以後の進行を停止して診断情報を保持（無断補正禁止）。
