# Proposal: scenario-pack-integrity

## Why
Phase 4から世界版へ拡張する前に、パックの不完全なチェックサム、同一ファイルの二重取得、LODとエンジンの州順序不一致を防ぐ。Issue #4 のP0第一スライス。

## What Changes
- 検証モードの必須ファイル集合とSHA-256書式を確定し、HTTP失敗を拒否。
- 検証したテキストをパースし、描画時にも同じマニフェストで検証する。
- 地図LODごとの州IDと順序、地物型を確認する。

## Capabilities
- Modified: scenario-system

## Impact
- engine/scenario/loader.ts、types.ts、ui/engineClient.ts、パック検証テスト、CI。
- 既存パックとv4セーブのハッシュ形式は変更しない。file://と非検証モードの互換を維持する。
- パック生成、完全なジオメトリトポロジ検証、署名による真正性、世界全域版、WorldStateハッシュは後続変更。
