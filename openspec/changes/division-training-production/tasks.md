# Tasks: division-training-production

- [x] 1.1 目的: 師団の即時作成を訓練方式に移行する。対象: templates.ts / commands.ts / training.ts。作業: 固定3編成、資源予約、20枠、配備・返却を実装。テスト: training.test.ts。期待値: 予約資源と配備数が一致する。完了条件: コードと回帰テストを追加。
- [x] 1.2 目的: 既存セーブを保護する。対象: serialize.ts / hash.ts / combat.ts。作業: v5とv4読込、編成係数、相対損耗閾値を実装。テスト: training.test.ts / save.test.ts。期待値: 復元後に訓練状態とハッシュ一致。完了条件: 実装とテスト追加。
- [x] 1.3 目的: 通常画面で操作する。対象: GameScreen.tsx / panels.tsx / i18n.ts / production.ts / ui.ts。作業: 募集・生産パネル、配分、進捗。テスト: recruitment.spec.ts。期待値: 命令を適用できる。完了条件: 通常UIのテスト追加。
- [x] 1.4 目的: CIで発見した保存破損を検出する。対象: serialize.ts / save.test.ts / training.test.ts。作業: v5 payload CRC-32と正規表現を検証。テスト: ビット反転、不正構造、v4互換。期待値: 破損拒否、現行の往復一致。完了条件: 修正と回帰テスト追加。
- [ ] 1.5 目的: リリース検証。対象: check.yml。作業: CI実行・ログレビュー。テスト: typecheck / Vitest / build / Playwright / OpenSpec strict。期待値: 全合格。完了条件: 最新HEADのCI成功と実URL確認。旧v4実ファイル、AI移行、自由編成は後続。
