# Phase 8A — 東アジア主要港の初期データ（ゲーム用）

## 目的と適用範囲
- シナリオ `modern-eastasia` v0.2.0 は、港を沿岸州と別のエンティティとして登録する`maritimeMapVersion:1`を使用する。
- 初期港は東京、横浜、大阪、博多、釜山、仁川、上海の計7港。現時点で実地の港湾施設形状・所在緯度経度を個別に持たず、ゲーム画面のアイコンは該当**行政区分の州ラベル座標**に置く。正確な岸壁・埠頭の地図ではない。
- 出発港と接続海域の組はゲーム向けの代表的な抽象モデル。海域4区間と海路5エッジはゲーム設計上の仮置きであり、実際の船舶航路や航行制限を意味しない。
- `capacity`、`repairSlots`、`dockyardSlots`、海路`cost`は**ゲームバランス用の無次元仮値**。実在の取扱量、港のバース数、造船能力、距離、所要日数、輸送船の収容力、法的利用権を示さない。

## 出典とマッピング
| Pack Port ID | 対応州ID | 港の所在確認 | 注記 |
|---|---|---|---|
| port-tokyo | JP-13（東京都） | [東京都港湾局](https://www.kouwan.metro.tokyo.lg.jp/) | 州の代表点で表示 |
| port-yokohama | JP-14（神奈川県） | [横浜市港湾局](https://www.city.yokohama.lg.jp/lang/overseas/port/about_us/outline/overview.html) | 州の代表点で表示 |
| port-osaka | JP-27（大阪府） | [大阪港湾局（大阪府）](https://www.pref.osaka.lg.jp/soshikikarasagasu/bu_kowan/) | 州の代表点で表示 |
| port-hakata | JP-40（福岡県） | [福岡市港湾空港局](https://www.city.fukuoka.lg.jp/kowan/hakata-port/) | 州の代表点で表示 |
| port-busan | KR-26（釜山広域市） | [Busan Port Authority](https://www.busanpa.com/eng/index.do) | 州の代表点で表示 |
| port-incheon | KR-28（仁川広域市） | [Incheon Port Authority](https://www.icpa.or.kr/eng/content/view.do?contentKey=864&menuKey=641) | 州の代表点で表示 |
| port-shanghai | CN-SH（上海市） | [Shanghai International Port Group](https://en.portshanghai.com.cn/) | 州の代表点で表示 |

原データの州ID・`coastal`はNatural Earthのシナリオ加工結果。港湾IDと行政州の割当は上記港の所在名称を基準とした初期対応付けであり、州境界と実港施設の位置一致は未検証。

## 海域と海路
- NW Pacific / Korea Strait / East China Sea / Yellow Sea の4つの抽象海域。海域の`polygonRef`は暫定識別子でありジオメトリは未収録。
- エッジのcostは正の無次元値。各ゾーンは連結、隣接は双方向であり、不存在ゲートは通行許可と同義ではない。
- 当面の艦隊・輸送・海上補給操作は未実装。`coastal`であるだけの州には港を付与しない。

## 今後の検証
1. 実海域geometryの導入とpolygonRefの存在確認、UI上の港の正確な座標（州ラベルではなく岸壁付近）
2. 港湾容量ゲームバランスのPoCと、ゲームバランス仮値を実績値として表示しないUIラベル
3. Gate/海峡・領海/通行権、海上輸送船団、独立な海上輸送状態機械、港からの物資出入量と二重支出防止
4. 新しいpack fingerprintへの更新によって旧pack版とセーブ互換性が変わることを利用者向けに告知（正式リリース前の変更）
