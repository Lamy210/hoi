# Proposal: phase3-tutorial

## Why

docs/02 ピラー3「チュートリアルは仕様の一部」。イベント機構（Phase 2実装済み）に載せた段階ガイドで、初回プレイの学習コストを下げる。

## What Changes

- **段階ガイドイベント**（プレイヤー国のみ・直列）: ①時間操作（開始直後）→②師団作成（①後）→③生産配分（②後）→④戦線作成（開戦後）→⑤予算・研究（③後）。各ステップはトリガー条件（コマンド発行実績）で完了し、次のガイドをアラートで提示。
- トリガー拡張: `commandDone`（type一致のジャーナル参照）をevent-systemに追加。
- パック tutorial.json → events.json に統合（type:'tutorial'フラグ・UIは専用スタイルで表示）。

## Impact

- Affected specs: `event-system`（チュートリアルのイベント実装）
- Affected code: systems/events.ts（commandDoneトリガー）・public/packs/modern-eastasia/events.json・UI（ガイドアラートの強調表示）・i18n
