## ADDED Requirements

### Requirement: 統合作戦の権限と決定論
AIは手動命令を尊重し、戦争状態と承認を実行直前に検証しなければならない（SHALL）。

#### Scenario: 作戦承認が取り消される
- **WHEN** 作戦承認が取り消される
- **THEN** 古いAI攻撃案を実行しない

### Requirement: 同時戦闘と航空任務
交戦結果は同一snapshotから計算し、機数・燃料・任務枠の重複を禁止しなければならない（SHALL）。

#### Scenario: 師団配列を並べ替える
- **WHEN** 師団配列を並べ替える
- **THEN** 同一seedの戦闘結果が一致する
