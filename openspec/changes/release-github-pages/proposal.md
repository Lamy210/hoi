# Proposal: release-github-pages

## Why
Phase 4のプレイ可能なゲームをサーバー不要で公開し、公開成果物の起動不良を防ぐ。

## What Changes
- GitHub Pagesを初期公開先とし、mainの検証済みdistを配信する。
- 公開用ビルドとE2E専用ビルドを分離する。
- /hoi/ サブパスで実ブラウザによる起動・地図・時間進行を検証する。

## Capabilities
- New: release-deployment

## Impact
- GitHub Actions、Vite、Playwright、公開設定、運用文書。
- サーバー・認証・課金・クラウドセーブは対象外。
