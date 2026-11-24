# Phase8A-1: Maritime catalog loader / static contracts

## Background
#73のPhase8A最初の安全な実装単位。既存packは陸州にcoastalフラグがあるだけで、Port・SeaZone・NavEdge・Gateを区別しない。海運/上陸/補給を合法に実装するために、出発港/海域が存在するシナリオを型と来歴で厳密に扱う必要がある。

## Scope
- `PackManifest.maritimeMapVersion:1` をopt-in capabilityとして追加。宣言時のみ`sea-zones.json`, `ports.json`, `nav-edges.json`, `sea-gates.json`を**4つとも必須**とする。
- 各資産は既存SHA-256チェックサム検証を通過した同一バイト列からJSON解析する。capabilityなしの既存packの挙動を変えない。データ中の参照は名前空間を持つ安定文字列ID。
- SeaZone: label, polygonRef, neighbors[]。Port: coastal provinceId, sea zone, capacity, repairSlots, dockyardSlots。NavEdge: 有向表現ではない2海域間の無向路、正の抽象cost、gateId任意。Gate: coastal landProvinceIds と seaEdgeIds。
- 不正ID/重複、海上経路の自己接続や重複、非対称隣接、不明参照、欠落資産、不正容量、checksum差異はロード拒否。
- 旧packのマニフェスト/指紋を変えない。海域導入packでは静的な海域カタログをpackFingerprintに混ぜ、セーブのパック不一致を検出。
- 架空の海域fixtureで肯定/否定テストを実施する。初期公開の現代東アジアpackに根拠のない港・架空の海域を無断追加しない。

## Explicitly Not Done
- 海域polygon描画/港選択UI、陸海ゲートの移動規則、艦隊建造・輸送船・強襲上陸、海上補給のsimulationはまだ未実装。現行の陸上移動と補給コードは変更しない。
- 実在の港湾施設の運用数値、航路や軍事データを推定しない。fixtureのcost/capacityはゲーム用の架空値。
- 初期capabilityは静的packデータ契約。将来の港湾制圧・損傷・艦隊運用は別の状態・セーブ契約が必要。

## Gate
TypeScript/Vitest/Build/Playwright/strict OpenSpec全成功、古いpackロードと旧フィンガープリント不変、架空パックの不正値を拒否。
