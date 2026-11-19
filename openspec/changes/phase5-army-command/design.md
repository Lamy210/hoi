# Phase 5C 陸軍指揮設計
docs/20の横断契約を適用。数値上限は初期ゲーム調整値。戦術的精密再現ではなく州・tick単位の抽象モデル。

## データ
ArmyGroup{id,owner,name,commanderId?,color} / Army{id,owner,groupId?,name,commanderId?,color}。Unit.armyId nullableを唯一の正とし逆引きは派生。Armyは0〜24師団（初期値）、Groupは0〜5 Army。国家上限Army256,Group64。上限超過を暗黙移籍させない。未所属師団も移動可能。指揮官は師団/Army/Groupのいずれか1職、役職別修飾の合算上限は実装前に確定。初期版は既存師団指揮官係数のみ戦闘に適用し、上位指揮官は表示/管理のみ（数値二重適用なし）。
Operation{id,owner,armyId?,kind:frontline|offensive|fallback|garrison|rally,state:draft|ready|active|paused|completed|invalid,frontId?,provinceIds[],targetIds[],priority,revision,reason?}。draftは永続化可、既存Frontは境界の派生viewまたは移行済み互換データとし二重書込禁止。Unit.operationId nullable: 一師団一作戦。軍集団作戦は配下Armyの作戦をまとめるUI単位、直接命令競合は生じさせない。前線は自国支配州と敵境界の接続を検証。防衛線/集結は自国又は通行権のある州、攻勢は交戦相手の州。線は座標でなく州/edge ID、攻勢矢印はUI派生。名称1〜64文字、ID単調採番。作戦上限国512、単一注文最大256師団。Groupをまとめて選択する場合も256以下、超過は明示的分割。色は識別用、選択はUIローカル。

## コマンドと命令競合
| type | payload | 条件 |
|---|---|---|
| createArmy / createArmyGroup | name,color | 自国、上限 |
| assignArmy | unitIds[],armyId|null | 全員自国・生存、輸送拘束なし、上限、原子的 |
| assignArmyGroup | armyIds[],groupId|null | 全軍団自国、上限 |
| assignLeader | targetKind,targetId,commanderId|null | 同国・同時1職、既存職解除の確認 |
| deleteArmy / deleteArmyGroup | id | 空のみ、作戦参照解除済み |
| createOperation | armyId?,kind,provinceIds[],targetIds[],priority | 自国、合法州、draft |
| reviseOperation | id,expectedRevision,provinceIds[],targetIds[] | paused/draftのみ、参照検証 |
| assignOperation | id,unitIds[] | 自国、所属条件、全件原子的 |
| unassignOperation | unitIds[] | 自国、輸送拘束なし |
| setOperationState | id,state:active|paused | 有効な計画、pausedで自動進行停止 |
| moveUnits | units[],target,mode?:replace|append | 旧payloadはreplace、全員合法、重複ID拒否 |
| haltUnits | unitIds[] | 移動停止は次の既存セグメント境界、強制後退除外 |
| resumeAutomation | unitIds[] | 手動hold解除、作戦割当へ復帰 |

選択元が軍団/軍集団でも実行時は具体的unitIdsのsnapshotを送る。Workerで所有権・容量・経路・状態を再検証し、1件違法なら全件拒否。到着済みはno-opとして許可、全員到着済みの既存alreadyAtTargetは互換。命令の上書き時に進行中セグメントの現在位置と進捗を保持し、次の端点から新経路へ接続。勝手な瞬間移動なし。appendは最大16目的地。作戦は明示的手動hold/移動キューを上書きしない。手動命令完了後もmanualHoldを維持し、resumeAutomationで解除。優先順位: 強制撤退/輸送拘束 > 手動命令/hold > 割当作戦 > 待機。古い週次frontai命令はapply時にもoperationId/revisionとmanualHoldを確認し、無効なら拒否。AIも同じ制約。作戦の一時停止は未開始の自動命令を破棄し、進行セグメントは境界まで。手動命令は別扱い。

## 作戦の更新
既存fronts.tsの週次計画を再利用。自国/敵境界の変化でdirty。平時の前線準備は許可、攻勢開始は交戦状態必須。和平で敵攻勢をinvalidへ移し未実行自動命令を破棄。経路は敵中間州を素通りさせず、戦闘・占領ルールを順次適用。防衛は味方境界の穴埋め、撤退線は選択した合法州へ集結。作戦矢印は到達予定を示し占領保証ではない。UIに割当数、実行中、到達不能、補給不足、手動holdを表示。計画AIの具体的な選択関数は既存戦力・補給・距離を純粋評価し、tie-break id昇順。作戦の自動進行は週次・dirty、同師団への二重発行なし。

## UI
地図クリックで選択、Shift/Ctrl/Cmdで追加/解除、ドラッグ矩形（選択モード）と地図パンを区別、右クリック/タップ用明示ボタンで移動。軍団バー、全選択、編入/解除、作戦へ割当、地図上の色/矢印、実行/一時停止、停止/自動復帰。タッチは長押しに依存せず複数選択トグル。右クリック・編集・ドラッグの競合禁止、Escapeでモード解除。Canvas/MapLibre共通ID、ズーム/高DPIで選択一致。視認性は色だけに依存しない。

## 保存・性能
想定順のschemaはv7（docs/20の予約表、実装時確定）。旧frontIdを作戦へ変換し旧unit/commander IDを維持。旧移動中のsegProgressを保持。新しいmanualHold、waypoints、operationRevision、階層・命令をハッシュ/保存。部隊消滅時参照解除、国消滅で作戦停止。UI選択は保存不要。部隊index・経路キャッシュは支配/通行権/海峡変化で失効。1024師団選択表示の描画負荷も測定するが1コマンド上限256を維持。