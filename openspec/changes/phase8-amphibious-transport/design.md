# Phase 8C 海上輸送・上陸のゲーム設計
docs/20とPhase8A/Bの契約を使用。陸軍・艦隊の操作を一つのゲーム内作戦に結びつける。係数は架空fixtureで検証するゲームパラメータであり、実世界の作戦遂行指針ではない。

## 状態と参照
TransportOperation{id,owner,kind:transfer|amphibious,armyOperationId?,originPortId,destination:{portId}|{coastalProvinceId},unitIds[],transportShipIds[],escortTaskForceIds[],routeZoneIds[],state,revision,reason?,preparedTicks,transitProgress,remainingCargo,createdTick}。
state=draft|preparing|ready|embarked|inTransit|arrived|landingBattle|returning|completed|cancelled|blocked。
draftは師団割当編集可、preparing以降は同一師団・輸送艦が複数輸送に拘束されない。Unit.locationをland(provinceId) | embarked(operationId) | landing(operationId,provinceId)へ拡張。旧locは陸上にいる時のみ有効、海上師団は通常の陸上戦闘・補充・占領・移動・戦線AI対象外。隊列・人員・装備は既存Unit IDのまま、移送で複製しない。輸送船も専用作戦IDに拘束され、同じ容量で貿易/別輸送を実行しない。
輸送容量はモデルのゲーム用cargoCapacityと稼働状態で計算。師団の必要容量は版付き編成のtransportWeightを参照（数値・換算は実装前の抽象fixtureで固定）。単一作戦の選択上限は256師団、同時作戦上限は国家64（初期案）。同一作戦では全師団を一括予約、不足時は分割をUIで提案するが勝手に一部を出航させない。
## 状態遷移
| 現状態 | イベント | 次状態 | 効果 |
|---|---|---|---|
| draft | 準備の開始 | preparing | 合法な出発港・目的地・艦/師団・ルートを検証し、拘束 |
| preparing | コマンド/準備完了 | ready | 準備日数と集結・容量検証、未充足なら準備中 |
| ready | 実行 | embarked | 現在の権利・容量・海域ゲーム状態を再確認し一括乗船 |
| embarked | 日次 | inTransit | 海上グラフの進捗開始 |
| inTransit | 港間輸送到着 | arrived | 合法港へ同一Unitを降船 |
| arrived | 日次確定 | completed | 拘束と残予約を解放 |
| blocked | 権利/容量再成立・再開 | returning または inTransit | 同じ位置から合法な経路を再計算 |
| inTransit | 上陸先到着 | landingBattle | landing型で陸戦システムに引渡し |
| landingBattle | 陸戦終了・成功 | completed | 生存師団を陸上stateへ、既存占領ルールで処理 |
| landingBattle | 失敗 | returning/blocked | ゲーム内帰還処理、合法な帰還先なしはblocked |
| pre-transit | 中止 | cancelled | 拘束解放、未使用予約のみ返却 |
| transit/landing | 中止 | returning/blocked | 位置や進捗を巻き戻さない |
| returning | 合法港へ到着 | cancelled | 生存師団の降船と拘束解放 |

準備段階の師団は出発港まで陸軍の通常合法移動で集結する（自動/手動選択）。資源・容量は開始時に予約、海上移動を始める時点で再検証。港間輸送は自国/許可された港、強襲上陸は交戦相手の沿岸州のみ、通常moveUnitsから暗黙変換しない。制海指標は8Bの同日結果を参照、unknown/未評価を無条件成功にしない。出航/継続のゲーム上の成立条件はpackの抽象ルールとして設定し、UIに可否と理由を表示する。具体閾値は実装前に架空fixtureで固定。平時の港間移送は海上通行権と容量で判定し、交戦相手不在によるunknownだけで阻止しない。交戦中の制海条件はシナリオの抽象ルールに従う。準備中は目標変更可（予約を原子的に更新）、乗船後の目標変更は帰還から別作戦を作る。海上での陸軍直接移動、港喪失時の瞬間帰還は禁止。

## 日次・事故・復元
順序はコマンド適用→港/海域権利・容量更新→海軍移動/抽象海戦→制海指標→輸送進捗・損失通知→上陸戦闘（陸戦）→占領→補給/経済更新。詳細schedulerは既存陸軍combat内のtickMovementと二重実行しないよう一元化する。輸送船喪失は同一イベントIDで一度だけ処理し、船上の人員/装備損失を共通台帳へ記録。損失の具体配分はゲーム設定と架空fixtureで決める（0..現有量）。全輸送能力喪失、停戦、目的港支配変化、通航不可はblocked/returningへ。撤退できない場合は既存のゲーム内損失処理を用いる（無料復活・敵領への自動生成なし）。戦争終了で新たな上陸戦闘を開始しない。
上陸戦闘は新たな勝敗システムを作らずcombat-systemが解決。専用のゲーム係数は抽象化して実装前に固定。成功しても即時owner/controller移転なし、旧占領条件を用いる。敗北時は海上の同じ作戦・生存師団に戻す。移動中の師団は配備済み人員に含めるが陸上の通常補給要求から除外する。

## 海上補給と貿易
港湾ノード→海域edge→港湾ノードを兵站グラフに追加し、陸・海とも現行の距離ベース供給を一貫した容量モデルへ段階移行。港/航路容量、輸送艦の空き、海域ルールによる利用可否を入力とし、同じ輸送容量を軍事移送/補給/貿易に二重割当しない。一日ごとに確定した容量を安定ID順に配分、予約済み作戦容量は別用途に使用不可、残容量の優先度は国policyで設定。補給途絶は供給係数に反映、実配送されていない財の補充は不可。貿易は既存Phase6Bの在庫/貨幣上限を維持。海域なし旧packでは海上補給を仮定しない。航空/空輸は8Dで別契約。

## コマンド・UI
createTransportOperation{kind,originPortId,destination,unitIds,transportShipIds,escortTaskForceIds}、reviseTransportOperation{id,expectedRevision,...}（draft/preparingのみ）、prepareTransport{id}、executeTransport{id}、cancelTransport{id}、setMaritimeCapacityPolicy{priorityOrder}。作戦所有国、戦争状態、港権利、集合/拘束、ルート、容量をWorkerで検証。自動命令も同じゲート。失敗理由をUIに出す。作戦ツールバーから港間輸送/強襲上陸を選び、師団を割当、港と目標を選択、輸送容量/準備/海域条件をプレビュー、実行/中止、移動アイコン・上陸戦闘・補給の結果を表示。通常の陸軍作戦矢印と海上矢印を区別。選択/移動中の誤操作防止。AIは同一の制約を通し、任意に海越えしない。
全状態・拘束・イベント適用watermark・船/師団ID・経路進捗・台帳・供給を保存。復元時は参照と排他を検証。旧陸軍位置のunionへの移行はID維持、海上作戦の無い旧セーブは空から。ゲーム用架空海域で正常/中止/喪失/復元を検証後、海域対応シナリオに統合する。