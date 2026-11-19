# 18. Phase 4 実装報告 — 外交拡張・講和会議

- 作成日: 2026-11-19
- 状態: 完了（2 Change・openspec validate合格）
- 対象Change: `phase4-diplomacy-treaties`、`phase4-peace-conference`（docs/14 §5 Phase 4の第一スライス）

## 1. 実装スコープ

Phase 3までの外交は「スカラー関係値＋宣戦／白紙講和」のみだった。本スライスでdiplomacy-system baseline specの未実装部分（条約ライフサイクル・多要素関係値・講和会議・貢献度スコア）を実装した。

### 1.1 条約（phase4-diplomacy-treaties）

| 項目 | 内容 |
|---|---|
| 条約種別 | 不可侵・同盟・貿易協定・通行権（`TreatyType`） |
| 状態機械 | `proposed → active → annulled`（期限切れもannulled。既定720日・-1で無期限） |
| コマンド | `proposeTreaty` / `acceptTreaty` / `declineTreaty` / `annulTreaty`（全て検証→適用→ジャーナル） |
| 矛盾禁止 | 同盟国への宣戦は却下（`allied`）。不可侵相手への宣戦は条約を自動解除して開戦。戦争終結・国家消滅時にも全解除 |
| 提案フロー | 相手がAIなら適用時に即時判断（関係値×0.6 − 脅威×0.3 ＋ 種別ボーナス − イデオロギー距離×0.5 ＋ 難易度ノイズ）。相手がプレイヤーなら`proposed`で受諾待ち |
| 効果 | 不可侵=関係目標+15・AI宣戦候補から除外。同盟=+25・宣戦禁止。貿易協定=+10＋月次貿易量1.5倍。通行権=同盟と同様に他国領通過を許可（`findPath`の通行判定に接続） |

### 1.2 多要素関係値

- 週次システム（`systems/diplomacy.ts`）が`target`へ±2/週でドリフトさせる（D-041）。
- contributors: イデオロギー距離（法体系代理・D-040: |経済法diff|×10＋|徴兵法diff|×5）、脅威認知（軍事力比×国境近接度×40・D-042）、経済相互依存（貿易協定+15）、共通脅威（+10）、領土紛争（主張×10・上限30）、条約ボーナス、戦争ペナルティ（−80）。
- 計算対象はactiveペア（隣接・条約・戦争・領有主張・既存関係値）に限定（仕様の性能要件）。
- トレースAPI `trace({kind:'relationTrace', id:相手国})` で全contributorsをUI公開。

### 1.3 講和会議（phase4-peace-conference）

| 項目 | 内容 |
|---|---|
| 貢献度スコア | `War.contrib`。戦闘は与ダメを戦力比で配分（/10で正規化）、占領+15・首都+20。決定論 |
| 講和要求 | `proposePeace { demands: 州[] }`。要求可能=自国支配の相手領（割譲）または自国領の相手支配（返還）。違反は`invalidDemand`で却下 |
| 要求価値 | 州10点・首都+20・返還は−10 |
| AI受諾判断 | `willingness = max(0, −warScore受諾側) + 長期戦360日超+40 + ノイズ`。value≤willingnessで受諾。判断はdecisionLogに記録 |
| endWar拡張 | `demand`＋demandsで要求州のみ領有移転（部分割譲）、其余は現状講和で解放（INV-1維持） |
| UI | 講和会議タブ: 戦争スコア・貢献度（自国/相手）・占領州の要求選択・妥当性警告・受諾待ち提案の要求州表示 |

## 2. 変更ファイル

- 新規: `src/engine/diplomacy/treaties.ts`、`src/engine/diplomacy/peace.ts`、`src/engine/systems/diplomacy.ts`
- 変更: `core/state.ts`（Treaty・War.contrib/offerDemands）、`military/war.ts`（条約解除・部分割譲）、`systems/combat.ts`（貢献度記録）、`systems/movement.ts`（通行権）、`systems/economy.ts`（貿易1.5倍）、`systems/score.ts`（外交軸+条約）、`commands.ts`（コマンド5種拡張）、`ai/ai.ts`（外交判断・宣戦候補フィルタ）、`ui.ts`（snapshot: treaties/relations/contrib）、`engine.ts`（relationTrace）、`core/hash.ts`（条約・貢献度をハッシュ対象化）、`save/serialize.ts`（v4＋条約検証）、UI（GameScreen・panels・store・i18n）

## 3. 設計判断（未確定事項の決定記録）

- **D-040** イデオロギー距離は法体系の距離で代理（パックに思想属性がないため。Phase 5のMOD対応で属性追加時に置換）。
- **D-041** 関係値は保存値を維持し週次で目標へ漸近（イベントdeltaの即時ジャンプを避け、外交に時間感覚を持たせる）。
- **D-047修正** AI講和受諾式は当初`max(0, +warScore)`で「劣勢側が一切受け入れない」欠陥があったため、`max(0, −warScore)`（劣勢ほど譲歩を受け入れ）に修正。仕様の「占領現状ラインが基準」と整合。

## 4. 検証結果

| 検査 | 結果 |
|---|---|
| Vitest（unit/integration/property） | **71/71 合格**（Phase 3比+15: 統合13・プロパティ2を追加） |
| E2E（Playwright） | **13/13 合格**（外交・講和会議の2シナリオを追加） |
| typecheck（tsc --noEmit） | 合格 |
| openspec validate | 2 Changeとも合格 |
| bench（性能ゲート） | tick中央値0.046ms／p99 0.725ms（予算16ms/tickに対し余裕≥20倍）・戦時p99 0.721ms・セーブ往復ハッシュ一致 |
| セーブ | `SAVE_SCHEMA_VERSION = 4`（treaties・war.contrib・nextTreatyId）。整合検証に条約の参照範囲・型・状態を追加 |
| i18n | ja/enキー差分ゼロ（条約・講和・アラート35キー追加） |

## 5. 既知の制限と次フェーズ

- 同盟は「宣戦禁止・関係改善・通行許可」まで。参戦（call to arms）はWar参加者の多国化が必要なため未実装（Phase 4後半）。
- 制裁・禁輸・共同研究条約、国際機関の投票はbaseline specのまま未着手。
- 海軍・空軍・国家方針・講和会議の多国化（連合戦争）・シナリオ拡大（ティアM/L）は次スライス。
