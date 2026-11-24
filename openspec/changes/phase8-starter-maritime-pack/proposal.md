# Phase8A-3: 東アジア初期港・海域パックの導入

## Motivation
Phase8A-1の型/読み込みとPhase8A-2のUIは完成したが、現行シナリオには港が収録されておらず、港の位置・能力をゲーム画面で確認できない。既存データの港IDへ検証可能な現実の地域対応を追加する。

## Change
- `modern-eastasia` manifest `maritimeMapVersion:1`、パックver 0.2.0とし、7つの主要港・4つの抽象海域・5本の双方向エッジ・ゲート0件を追加する。
- 所在行政区分は東京/神奈川/大阪/福岡/釜山/仁川/上海の既存Province IDへ紐付け。都市に港があることは行政の公式資料で確認し、名称は資料のとおり。
- 港湾容量・修理・造船スロット・海上エッジcostは**無次元の仮のゲーム用数値**であり、公式の施設実績に基づく数値ではない。海域ポリゴンは未提供であり、polygonRefは暫定識別子。航路や海峡の地理的精度は後続PoCで確認する。
- 既存checkums.jsonにmanifestと4海事JSONのSHA-256を追加。ブラウザ検証ロードとfile://静的インポートを両対応。
- シナリオに港が入ったため、旧coastal-only検証は明示的な旧pack fixtureに変更。現在のパックで7港表示・クリック・表示切替・セーブ再生をCI検証。
- 同一の基準packでセーブ保存と復元、決定論的戦闘は変えない。ただし新しいpack fingerprintは旧版のシナリオとは別であり、既存旧packセーブはpack mismatchとなる場合がある（未リリースを前提としたpack改訂）。

## Non-goals
- 艦隊、強襲上陸、港間輸送、海上補給を誤って可能にしない。
- 実際の港湾能力・海上航行距離・軍事基地や詳細海図を推定/掲載しない。
- 港の行政州代表点を正確な埠頭所在地と表示しない。

## Validation
- SHA-256完全一致・MaritimeCatalog整合・7港のcoastal/参照/連結性
- UI: 実パックで港マーカー7件・港一覧選択・表示ON/OFF
- Legacyテスト: capabilityを意図的に除去した旧packで港を創作しない
- TypeScript/Vitest/Build/Playwright/OpenSpec strict全成功
