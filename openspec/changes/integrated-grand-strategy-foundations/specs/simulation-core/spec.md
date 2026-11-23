## ADDED Requirements

### Requirement: 確定した5フェーズTick
参照シミュレーションは`economy-market → research-production → supply-movement-delegation → combat-airstrike → occupation-politics`の決定論的順序で実行しなければならない（SHALL）。フェーズ内で得た市場価格や戦略爆撃後の損害を同tick前半の生産へ再帰的に反映してはならない（MUST NOT）。

#### Scenario: 爆撃工場の産出
- **WHEN** 戦闘フェーズで工場が破壊される
- **THEN** 本日生産分は先頭スナップショットを用いて完了し、翌tickから工場損害が産出へ反映される

#### Scenario: 同じ入力を同じ日数実行
- **WHEN** 同じルールセット、seed、初期状態とコマンドで30日進める
- **THEN** state hash、資金・POP・装備・戦闘・占領結果が同一になる

### Requirement: 旧ゲームループへの段階移行
現行のセーブv18、`registerAllSystems`、既存の戦線/戦闘/研究実装を直接変更してはならない（MUST NOT）。本番統合はデータ移行とruleset切替の受入条件を満たした後に行う（SHALL）。

#### Scenario: 未リリースの旧セーブを読み込む
- **WHEN** 新スキーマ採用後に旧セーブv18を読み込む
- **THEN** バージョン非対応を明示して拒否し、ゲームデータを半端に復元しない
