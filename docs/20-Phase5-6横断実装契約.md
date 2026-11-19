# Phase 5〜6 横断実装契約
状態: PR #13の設計案。実装済みとは扱わない。対象Change: phase5-division-designer / phase6-equipment-lines / phase6-industrial-economy。各Changeのdeltaが規範、本書は共有設計・検証詳細。矛盾時は実装前にdeltaと本書を同じPRで修正する。

## 1. 段階・所有権
5A(#11)は固定編成、5Bは版付き自由編成と訓練、6Aは装備ラインと共通台帳、6Bは資源/労働/産業。6Aで5Bの予約優先順を明示的に置換し、6Bで6Aの産出計算に投入/労働制約を追加する。先行deltaのsync/archiveは各実装開始前のゲート。過去Changeを勝手に完了扱いしない。
| 状態 | 唯一の書込責務 |
|---|---|
| pack catalog / ID参照 | scenario loader（検証後immutable） |
| 編成版、unit・training予約 | military / training |
| 稼働工場、ライン・端数 | production（建設が能力変更を通知） |
| 財・予約・部隊保有の数量 | inventory service（6Aで統合、5Bは同じ保存則を既存配列に適用） |
| 人口・軍務・民間労働供給 | population（6Bで統合） |
| 貨幣・市場・貿易 | economy |
| UI | 読取snapshot、コマンド発行のみ |

## 2. コマンド共通契約
Workerがissuerとseqを発行し、UIは国ID、コスト、産出能力等を権限の根拠にできない。playerはworld.playerCountry、ai:<index>は生存する自国のみ（frontaiは軍事編成/生産/経済コマンド不可）。整数・文字列・列挙の型、上限、参照先、資源残高を実行時検証。未知フィールドは拒否する。UIのプレビューは確約でなく、tick境界で再検証する。
- コマンドFIFOで、直前の成功結果を次の検証に反映。個々の命令の検証→差分計画→全差分commitは原子的。検証失敗では資源/ID/状態を変えない（却下ジャーナル・警告のみ）。
- 5B開始時に永続highWatermark（issuerごとの正のsafe integer seq）を導入。適用済み・却下済みseq以下はduplicateCommand/staleSequence。飛び番は許容、再利用禁止。既存AI/frontai/event等の発行元と互換を調査し、未割当seqは内部発行元で一元採番。400件journalは監査表示用に限定。v4/v5では保持journalと既存runtime countersから既知最大値を復元し、それ以前の不明seqを復元できるとは主張しない。移行後の新規コマンドを対象に永続性を保証する。seq枯渇時は停止してエラー。ロード前に旧Workerを停止し旧セッションの応答を捨てる。
- 応答: {issuer,seq,type,ok,reason?,tick,entityId?}。RPC requestIdと命令seqは別。queuedは「送信済・未適用」、okは「登録済」であり訓練完了ではない。UIは適用通知とsnapshotを照合し失敗理由を日英表示。成功通知だけで楽観的に在庫を減らさない。
- 共通理由: badParams / notYourCountry / countryDead / staleRevision / unknownReference / limitExceeded / insufficientManpower / insufficientEquipment / invalidState / notControlledByYou / duplicateCommand。現行理由キーと互換する変換表を実装時に追加。

## 3. 時間と数値
tick境界でFIFO命令を旧tick tに適用し、tickをt+1に進めて日次を実行（現行engine.ts）。一時停止中は日次計算なし。日数はゲームtick、実時間と混同しない。訓練開始 tick T はその日の終わりに予約完了した境界を表し、readyTick=T+duration、翌日から進行。5Aの既存readyTickを移行時に再計算しない。
数量は有限・非負。旧float在庫は移行で損失させない。新しい装備の発注/払出は整数、損耗・旧在庫は小数を許容するため内部台帳で小数の数量も保持し、画面では表示丸めのみ。資源・貨幣の比較は abs差 <= max(1e-8, 1e-10×max(abs(a),abs(b))) を回帰テストに使用（負値を許す基準ではない）。整数ID・工場・tickは厳密一致。非有限値は保存拒否。安定ID昇順で加算・配分（localeCompareを使わない）。性能目的でも順序を変える場合はリプレイ検証が必要。

## 4. 保存・移行
現行v4: 旧hashWorld、v5: CRC-32と旧状態ハッシュ（#11依存、偶発破損検出で認証ではない）。5B=v6、6A=v7、6B=v8を暫定割当。他Changeが先に番号を使用した場合は実装前に台帳を更新し二重割当禁止。旧版を新版関数で検証せず、当時の検証器とpack identityを使用する。版変換は順序付き純粋関数、1回、成功後のみ置換。旧ファイル自体は上書きせず別スロットへ保存。v1〜3と全面SHA-256は#2/#4を残課題とする。新版→旧版のダウングレードは拒否し理由表示。
- 既存v4/v5の実ファイルfixtureを各リリースSHAで生成し、生成SHA/pack fingerprint/checksum/作成手順を記録。自作のヘッダ差替えだけで互換合格としない。
- 旧IDの維持、各国/財/予約/部隊保有/人力/貨幣の移行前後比較。packを変更する場合は明示ID対応表、未知参照は拒否。パック・定義版・コマンドwatermark・予約・端数・優先度・全未来挙動状態を新版ハッシュに含める。派生キャッシュは復元時再計算し同一結果。
- 破損、未対応版、定義不整合、残高不一致、移行途中例外は現在WorldState/セーブスロットを維持。ユーザーに復元不可理由を通知。
- ロードは命令反映済み境界のみ。自動セーブも同じ制約、保留中AI命令など保存に必要な未来状態の扱いを明示し回帰検証。完全な旧バージョン再現性は保証しない。

## 5. ゲート
Phaseごとにstrict、型検査、全Vitest、通常UI Playwright、実公開URL smoke。性能は同一機材・seed・build・データで旧/新p50/p95/p99 tick、メモリ、save bytes、UI応答を比較し記録。性能予算の確定は旧実測基準を取得してから。50年×20seed（既存ゲート）でNaN/負残高/資産不整合/参照切れゼロ。テスト失敗時に期待値を緩めて合格扱いしない。回帰比較の差が意図した仕様変更なら理由を文書化。各Changeのacceptance.mdの全ケースを自動化し、fixture入力、期待値、テストファイル、結果の対応を残す。
