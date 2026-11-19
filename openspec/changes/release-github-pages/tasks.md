# Tasks: release-github-pages

- [x] 1.1 公開モード分離（src/main.tsx, package.json）。E2E専用ビルドを定義し、公開モードではフックを無効化する。ブラウザテストで確認する。
- [x] 1.2 サブパス検証（playwright.pages.config.ts, tests/pages）。/hoi/から日本でゲーム開始し、地図・時間進行・パック取得・ページ例外を検査する。テスト実装済みを完了条件とする。
- [ ] 1.3 CI検証（.github/workflows/check.yml）。型検査・Vitest・build・Pages smoke・OpenSpec strictを合格させる。
- [ ] 1.4 Pages設定（Settings > Pages）。SourceをGitHub Actionsに設定し、mainのみの公開が成功すること。
- [ ] 1.5 実URL確認。HTTPSで初回プレイ・地図・時間進行・セーブ/ロードを確認し、公開コミットを記録する。
- [ ] 1.6 再現性向上（Issue #2）。lockfile生成・npm ci移行・全E2E検証・データ出典再確認を別変更で実施する。
