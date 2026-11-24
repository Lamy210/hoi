# Phase8A-2 港湾位置と海域カタログのUI表示

## Why
PR #76でPort/SeaZone/NavEdge/Gateの参照と安全な読込は完成した。しかしゲーム内の地図/情報パネルに表示するUIがなく、港の場所・支配・能力が確認できない。旧packは沿岸州フラグのみで、存在しない港が可視化されたり海上輸送可能と誤認される危険がある。

## Scope
- `projectMaritimeCatalog(pack)`はpack.maritimeがあるときだけ港ID・正しい州インデックス・ゾーンラベル・海路情報を決定論的に投影する。ない場合はundefined。静的projectionから支配権を推測せず、UiSnapshot.controllerを最新情報として参照する。
- UiMetaにoptional maritimeを追加。シミュレーションと保存v21は変更しない。
- MapRendererの共通API `setPortOverlay`をCanvas2DとMapLibreに実装し、州ラベル座標に「⚓」のボタンを描く。ズーム、パン、resize、DPR、選択/支配変化に追従し、描画不能/画面外なら非表示。ボタン選択は州選択へ戻し、手動移動・上陸命令を発行しない。
- マップツールに港表示のON/OFF、右パネルに港一覧・海域・支配国・容量/修理/造船の読み取り専用情報を追加。船団、強襲上陸、海上補給は未実装であることを明示。
- 港データが無い既存packは港マーカーも港一覧も表示せず、地図切替は disabled。架空packのfixtureで港の参照と動的支配、Playwrightで実DOM投影と選択/更新/廃止を検証。
- 海域のpolygonRefについてはPhase8A-2以降の検証済み座標アセットを待つ。未提供の海域ポリゴンを捏造しない。

## Non-goals
実海域geometryの描画、輸送船、港湾制圧/修理運用、航路能力、乗船・上陸、海上補給は別PR。既存の地上経路と補給システムには海路を混入させない。

## Acceptance
型検査/Vitest/Playwright/Vite build/OpenSpec strict成功。古いpackで0港。データがあるとき各Portの州、管理国、静的設備能力を確認可能。Canvas/MapLibreどちらもマーカー選択可能。
