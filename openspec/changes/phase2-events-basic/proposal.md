# Proposal: phase2-events-basic

## Why

シナリオ固有の出来事（歴史イベント・バランス調整用の世界反応）をコードではなくデータで記述できる基盤が必要（docs/02 §拡張性、docs/09 D-006）。チュートリアル（Phase 3）もこの機構に載せる。

## What Changes

- **イベント定義**: パックの `events.json` で宣言的に定義（id・trigger・once・effects）。
- **トリガー**: `date`（年月日）／`warStart`（参加国）／`provinceOccupied`（州・占領国）／`stockBelow`（国家・財・閾値）。
- **効果**: `relation`／`equipment`／`manpower`／`alert`（ローカライズキー＋パラメータ）／`declareWarAI`。
- **実行**: 日次判定（トリガー照合は決定論順）、once指定で1回のみ、発火はジャーナル＋アラート。発火履歴はセーブ対象。
- 現代東アジアパックに3イベントを同梱（冬季警報・戦争勃発の世界反応・装備不足警報）。

## Impact

- Affected specs: `event-system`（実装）
- Affected code: systems/events.ts（新規）、scenario/loader.ts（events.json検証）、core/state.ts（発火履歴）、save/serialize.ts（v2）、public/packs/modern-eastasia/events.json
