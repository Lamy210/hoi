# Design: phase4-peace-conference

## 設計判断（未確定事項の決定記録）

### D-046: 貢献度スコアの計算
戦闘ダメージを戦力比で配分して加算する: 攻撃側の加算 = `totalDmgToDef × (自師団戦力/攻撃側総戦力) / 10`。占領完了は+15。首都占領は追加+20（warScoreForと整合）。スコアは戦争ごとに独立（`war.contrib`）で、講和時に要求価値と比較される。決定論（乱数を介さない配分）。

### D-047: 要求価値とAI受諾
`demandValue(w, war, proposer, demands) = Σ(10×州数 + 20×首都) + 返還州×10`。AI受諾条件: `demandValue(相手への要求合計) <= max(0, warScoreFor(w, war, 相手)) + (戦争360日超 ? 40 : 0) + noise`。プレイヤー宛の提案は受諾待ちになり、UIに要求州一覧を表示する。

### D-048: 妥当性の定義
要求州は「提案者支配かつ相手領有」（割譲）または「提案者領有かつ相手支配」（返還）のみ有効。無効州を含むdemandsはコマンド検証で却下（'invalidDemand:州名'）。UIは事前にグレーアウト＋警告表示する。

### D-049: 併合（victory）との関係
従来の'victory'（全占領地の領有移転）はAI側の講和提案種別として温存し、プレイヤーの講和会議はdemand+demandsを推奨。併合判定（checkAnnexation）は変更しない。
