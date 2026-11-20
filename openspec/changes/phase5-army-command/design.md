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
## 先行修正: 師団所在・一括移動UI
playable-map-controlsで自国師団カウンター、一覧・複数選択、明示目的州指示、残経路描画を先行実装する。永続Army/Group/Operation、矩形選択、移動中の経路変更・停止・手動holdは未実装で本Changeのタスクを完了扱いにしない。現段階では移動・戦闘・包囲中の手動移動は拒否し、再指示によるセグメント巻戻しを防ぐ。右クリックや移動モードは現行tick境界を維持する。軍団・作戦実装時にこの制限を置換する。

## 先行修正: 明示攻撃
playable-map-controlsの第2先行実装でtravelUnits（非敵対州を経由する経路を発行時に検証）とattackUnits（交戦相手支配の陸上隣接州、全師団が自国支配州で待機、全件原子的）を追加する。共通の既存移動状態を使用し到着時の戦闘を再利用するため、新save版は導入しない。現段階では最終目的関係から移動/攻撃を表示し、発行後の命令種別を永続化しない。旧moveUnits/AIは既存互換のまま。日次移動の通行権を再検証し無権限の越境を止め、占領の連続性を検証する。手動holdや作戦世代、戦闘中の移動再指示、長距離攻勢、海上上陸は後続。敵軍カウンターは現行の視界制限なしのモデルに基づく。実装時に新しい戦闘能力・実際の作戦を推定しない。


## 先行実装: 軍団・軍集団管理と師団兵站一覧
Army/ArmyGroup（id,owner,name,color; ArmyのみgroupId）を永続化し、Unit.armyIdを唯一の所属情報にする。未所属はnull/省略。createArmy/createArmyGroup/assignArmy/assignArmyGroup/deleteArmy/deleteArmyGroupをコマンドで実装。所有国・生存国・名称・色・ID・容量・全件所属を検証、空でない軍団/軍集団は削除不可。指揮官の上位職、作戦ID、rename、移動中の経路変更は後続。軍団/軍集団選択は所属師団IDをスナップショットし既存の移動/攻撃操作へ接続する。軍集団最大120師団。初期上限24師団/5軍団はゲーム調整値。
UIは自国師団の現在州・進行先、実保有/必要人員と2種装備、不足量、組織率（0..100）、実効補給効率を表示。実保有を整数に丸めてから集計しない。実効補給は現行effectiveSupply、州の供給効率とunitSupplyFactorを別々に表示。補給効率は配送物資量ではない。集計は選択範囲/自国全体で保有・必要量の和、組織率/補給は師団単純平均、0師団は平均なし。不足フィルタは実数比較、低補給50%は診断用UI閾値で戦闘修飾の追加ではない。検索は師団ID・現在州名/ID・所属軍団名。軍団選択と地図・一覧の選択IDを同期する。
v7を階層先行スライスに割当。v4/5/6は旧ハッシュで検証してから空の階層へ移行、既存師団ID・frontId・装備は維持。保存時のカウンタと所属をCRC/状態ハッシュに含め、参照先所有権・ID重複・上限検証に失敗した場合はロード拒否。国家消滅後の空組織は管理対象外として保持可能、削除ポリシーは作戦統合時に定義。戦域/指揮官・前線への作戦割当、装備別補充優先度は未実装。
