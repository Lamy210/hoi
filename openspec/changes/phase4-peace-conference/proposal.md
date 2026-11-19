# Proposal: phase4-peace-conference

## Why

Phase 3までの講和は「白紙/全割譲の2択」で、diplomacy-system baseline specの「講和の貢献度スコア」「講和会議UI」「妥当性警告」が未実装。docs/14 §5 Phase 4「講和会議」の第一スライスとして、戦争貢献度の記録と構造化された講和条件（領土要求リスト）を実装する。

## What Changes

- **戦争貢献度スコア**: `War.contrib: Record<country, number>`。戦闘（組織率・装備ダメージの戦力比配分）と占領（+15）で日次加算。セーブ対象。
- **講和条件の構造化**: `proposePeace`に`demands`（州インデックス配列）を追加。要求可能な州=自国が支配中の相手領（割譲要求）または相手が支配中の自国領（返還要求）。
- **妥当性チェック**: 占領現状に整合しない州は要求リストから除外され、講和会議UIに妥当性警告を表示。AIは無効州を含む講和提案を拒否する。
- **要求価値とAI受諾判断**: `value = Σ(州10点＋首都+20) − 返還は相手の要求扱い`。AIは `value <= warScore(相手) + 長期戦ボーナス + ノイズ` で受諾。判断はdecisionLog記録。
- **endWar拡張**: `demand`モード時に要求州のみ領有移転（残りは現状講和で解放）。`white`/`victory`は従来通り。
- UI: 講和会議タブ（戦争貢献度・占領現状・要求選択・妥当性警告・提案）。受諾待ち講和に要求州を表示。セーブv4。

## Impact

- Affected specs: `diplomacy-system`（講和の貢献度スコアのMODIFIED）、`combat-system`（貢献度記録）
- Affected code: diplomacy/peace.ts（新規）・military/war.ts（endWar拡張）・systems/combat.ts（貢献度記録）・commands.ts（proposePeace拡張）・ui.ts・engine.ts・UI・i18n・save/serialize.ts（v4）
