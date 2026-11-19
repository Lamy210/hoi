# Proposal: phase4-diplomacy-treaties

## Why

Phase 3までの外交は「スカラー関係値＋宣戦／白紙講和」のみで、diplomacy-system baseline specの条約ライフサイクル（不可侵・同盟・貿易協定・通行権）・多要素関係値（思想距離・脅威認知・経済相互依存・共通脅威・履歴・領土紛争）・トレース表示・AI外交判断が未実装。docs/14 §5のPhase 4「外交拡張（条約網・外交プレイ）・高度AI」の第一スライスとして必要。

## What Changes

- **条約モデル**: `Treaty { id, type: nonaggression|alliance|trade|access, a, b, startTick, expiryTick(-1=無期限), status: proposed|active|annulled }`。提案→承認→有効→解除/期限切れの状態機械。
- **条約コマンド**: `proposeTreaty`／`acceptTreaty`／`declineTreaty`／`annulTreaty`。相手がAIの場合は即時判断（関係値＋脅威認知＋乱数ノイズ）、プレイヤーの場合は受諾待ち。
- **矛盾状態の禁止**: 同盟国への宣戦は却下（'allied'）。不可侵条約相手への宣戦は条約を自動解除して開戦（仕様の自動解除）。戦争自動終結（併合等）時に条約も解除。
- **多要素関係値**: 週次ドリフト方式。`target = clamp(0 − イデオロギー距離 − 脅威認知 + 経済相互依存 + 共通脅威 − 領土紛争 + 条約ボーナス − 戦争ペナルティ, −100, 100)` に向けて週±2で関係値を移動。イデオロギー距離は法体系（経済法×10＋徴兵法×5）で代理（D-040）。全contributorsをトレースAPIで公開。
- **条約効果**: 不可侵=関係目標+15・AI宣戦候補から除外。同盟=関係目標+25・宣戦禁止。貿易協定=関係目標+10＋貿易量1.5倍。通行権=同盟と同じ移動規則（他国領通過）は既存のpathフィルタに追加。
- **AI外交**: 週次aiThinkに条約判断（関係>40で不可侵/貿易を提案、同盟は脅威共有時）。受諾判断はコマンドapply内で決定論RNG。全判断をdecisionLogに記録。
- **外交スコア**: 5軸スコアの外交軸に条約網を加算（不可侵+3・貿易+5・同盟+8）。
- UI: 外交パネル（関係一覧＋トレース＋条約提案/解除＋受諾待ち条約）。セーブv4。

## Impact

- Affected specs: `diplomacy-system`（条約の状態機械・多要素関係値の実装）、`ai-system`（外交判断ログ）
- Affected code: diplomacy/treaties.ts（新規）・systems/diplomacy.ts（新規）・military/war.ts（条約解除・endWar拡張）・systems/combat.ts（貢献度記録）・commands.ts・ai/ai.ts・systems/score.ts・systems/economy.ts（貿易協定）・core/state.ts（v4）・core/hash.ts・save/serialize.ts・ui.ts・engine.ts（relationTrace）・UI・i18n
