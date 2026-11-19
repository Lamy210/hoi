# Design: phase2-events-basic

## Decisions

- **D-033 イベント実行**: 日次システム `events`（登録順でAIより先）。トリガー照合は「イベント定義順・国/州はインデックス順」で決定論。effects適用はコマンドを介さず直接適用（世界側の事象でありプレイヤー/AIの意思決定でない）が、ジャーナルに `{issuer:'event', seq, type:'fireEvent'}` を記録。
- **D-034 発火履歴**: `w.firedEvents: string[]`（セーブ対象・hash対象）。
- **パック検証**: events.json は任意ファイル（無くても可）。存在すれば参照整合（国ID・州ID・効果パラメータ範囲）を検証し、違反はPackValidationError。

## Non-Goals

- 条件式DSL・MODスクリプトAPI（Phase 5）・LLM文章生成（ビルド時のみ、検討）。
