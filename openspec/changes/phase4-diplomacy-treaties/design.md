# Design: phase4-diplomacy-treaties

## 設計判断（未確定事項の決定記録）

### D-040: イデオロギー距離の代理指標
シナリオパックに思想属性は存在しない（パック拡張はPhase 5のMOD対応で扱う）。よって**法体系の距離で代理する**: `ideologyDist = |経済法diff|×10 + |徴兵法diff|×5`（0〜15）。法はphase3で実装済みでプレイヤー操作可能なため、「思想が近い国ほど条約が結びやすい」挙動がテスト可能。パックに`ideology`属性が追加された場合は置き換える。

### D-041: 関係値の週次ドリフト方式
baseline specの関係値は多要素計算だが、既存の関係値は戦争等のイベントdeltaで蓄積されている。**保存値vは維持し、週次システムが`target`へ±2/週で移動**する（即時ジャンプしない＝外交は時間がかかる）。`target = clamp(0 − ideologyDist − threat + interdependence + commonThreat − claims + treatyBonus − warPenalty, −100, 100)`。トレースは全contributorsを返す。activeペア（隣接・条約・戦争・領有主張・既存関係値あり）のみ更新（仕様の性能要件）。

### D-042: 脅威認知の計算
`threat = min(1,相手師団数/自師団数) × min(1,国境州数/自国境州総数) × 40`。影響力マップの簡易版（軍事力×国境近接度）。決定論（乱数なし）。

### D-043: 条約提案のフロー
- 相手がAI → apply内で即時判断: `acceptScore = relation×0.6 + threat×0.3 + treatyTypeBonus − ideologyDist×0.5 + noise(難易度)` > 0で受諾。判断はdecisionLogに記録。
- 相手がプレイヤー → status='proposed'で受諾待ち（アラート通知）。acceptTreaty/declineTreatyコマンドで確定。
- proposed状態はセーブ対象（tick跨ぎで消えない）。同一ペア×同一typeのactive/proposed重複は提案時に却下。

### D-044: 通行権（access）
軍事移動の`findPath`は自領＋開戦相手領のみ通過可能。access条約（相手が同盟国の盟主の場合も）があれば相手領を通過可能にする。実装はmovement.tsの通行判定にtreaties参照を追加。

### D-045: セーブv4
`treaties`・`wars[].contrib`を追加。SAVE_SCHEMA_VERSIONを4に上げる。旧バージョンのセーブはunsupported（開発段階のため後方互換なし・仕様の検証で拒否）。
