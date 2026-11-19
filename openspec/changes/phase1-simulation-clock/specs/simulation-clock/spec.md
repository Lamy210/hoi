# Spec Delta

## ADDED Requirements

### Requirement: 月次境界の定義
月次システムは `tick % 30 == 0` で起動し（SHALL）、シナリオは「1月=30日」宣言によってこの境界を上書きできる（SHALL）。

#### Scenario: 月次システムの起動
- **WHEN** tick 30/60/90 に達する
- **THEN** 月次登録システムが各tickで1回だけ実行される

### Requirement: 進行レートの自動抑制
tick処理時間が16ms予算を超えた場合、実レートは目標より低く自動抑制され（SHALL）、遅延警告フラグがUIに公開されなければならない（SHALL）。

#### Scenario: 遅延時の警告
- **WHEN** 連続したtickが16msを超過する
- **THEN** 進行は継続するが遅延警告フラグが立ち、UIはそれを表示できる

### Requirement: 速度切替の即時反映
速度段階の変更は現在のtick完了後に即時反映され（SHALL）、tickの欠落・重複を生じさせない（SHALL NOT）。

#### Scenario: 進行中の切替
- **WHEN** ×4で進行中に×8へ切り替える
- **THEN** 次のtickから新レートが適用され、日付連続性は保たれる
