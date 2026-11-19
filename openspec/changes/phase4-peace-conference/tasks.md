# Tasks: phase4-peace-conference

- [ ] 2.1 【目的】War.contrib（戦争貢献度）の型と戦闘・占領での記録を実装する
- [ ] 2.2 【目的】講和要求の検証（妥当性）・価値計算・AI受諾判断をdiplomacy/peace.tsに実装する
- [ ] 2.3 【目的】proposePeaceのdemands拡張とendWarの部分割譲を実装する
- [ ] 2.4 【目的】UI講和会議タブ（貢献度・占領現状・要求選択・妥当性警告）とi18nを追加する
- [ ] 2.5 【目的】セーブv4（war.contrib・講和要求）と往復テストを更新する
- [ ] 2.6 【目的】unit/integration/E2Eテストを書く

## 実装結果（2026-11-19）

- 全タスク完了。`diplomacy/peace.ts`（貢献度記録・妥当性検証・要求価値・AI受諾判断D-046〜D-049）、combat.ts（戦闘ダメージを戦力比配分で記録・占領+15/首都+20）、endWarの部分割譲（要求州のみ領有移転・其余は解放）、proposePeace demands拡張（invalidDemandで却下）、UI講和会議タブ、セーブv4。
- テスト: 統合5件（貢献度記録・妥当性却下・要求価値・部分割譲+AI受諾・セーブ往復）＋E2E 1件（講和会議UI→ソウル要求→部分割譲）が緑。
- 設計修正（D-047）: AI受諾式は「受諾側が劣勢（warScore<0）ほど譲歩を受け入れる」よう `willingness = max(0, −warScore受諾側) + 長期戦40 + ノイズ` に修正（当初の `max(0, +warScore)` では劣勢側が一切受け入れない欠陥）。
