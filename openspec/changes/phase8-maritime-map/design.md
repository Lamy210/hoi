# Phase 8A 海域・港湾データ設計
対象は架空・抽象化ゲームグラフ。現実の軍用航路案や作戦上の実用データを提供するものではない。

## 定義・参照
SeaZone{id,nameJa,nameEn,polygonRef,neighbors[],center,areaTag}。Port{id,provinceId,zoneId,capacity,baseRepairSlots,baseDockyardSlots}。NavEdge{a,b,cost,gateId?}。LandEdge{a,b,kind:land|fixedCrossing|strait,gateId?}。Gate{id,landProvinceIds[],seaEdgeIds[]}。IDはprefix付き安定ASCIIキー、国/州IDに依存しない。座標はWGS84、描画Web Mercator、極の投影制約・日付変更線を処理。経路costは抽象時間/距離単位としてpackで固定、座標描画から逆算しない。
- Portはcoastalの州と有効海域に接続し、稼働能力は支配・損傷を参照。港湾未定義の沿岸州も後続の上陸先候補として別途扱い、港を自動生成しない。
- 海域隣接は対称、重複/自己参照禁止、正の有限cost、未知gate拒否。海と陸のnode名前空間を分ける。海域の孤立は警告と意図的設定、経路探索は到達不能を正しく返す。
- 旧packのstrait=trueは明示的な渡河種別の移行表で分類する。分類不明のedgeは海上移動を有効にしたpackではロード拒否。海峡未分類をlandに偽装しない。旧陸専用packの互換モードでは旧挙動を維持するが海軍UIを無効にする。新海域packでは固定横断路だけ陸軍移動可、一般海峡/海は通常moveUnitsを拒否し輸送を使用。固定横断路の通過権と封鎖はゲーム内gate条件で判定。
- 海域を通過できる条件は後続のnaval-systemが参照する。海域の接続はシナリオ定義、海軍が存在しない状態で制海権や輸送の成功を推測しない。

## パック・表示・移行
manifest capability maritimeMapVersionを導入。追加海域・港湾・gate・geometryはチェックサム対象とし、同一取得バイトから検証/解析。ロード時に海域IDとLOD参照を検証し、既存州indexと異なるIDの混同を防止。3種類の選択対象（landProvince, seaZone, port）を型付きで返す。陸/海モードで色・ハイライト・ラベル・凡例、北向き投影、パン/ズーム/高DPIのPicking。港湾アイコンの重なりはクラスタ/一覧で選択。海域境界を主権国の色で塗らない。source/date/license/qualityを各カタログに保持。初期は小さな架空海域テストpackと既存東アジア用のゲーム区画を別々に検証。実データが未確定なら架空fixtureのみで公開条件を満たしたと主張しない。世界全域はPhase7の成果によって拡張。
旧packからの移行は明示対応表とpack識別子の版契約を必要とする。海上移動中の保存を陸専用packで復元しない。陸路/海域のキャッシュは支配・権利・gate変更で無効化。隣接・距離・港湾の不正参照ゼロ、既存地図の回帰テストを必須とする。