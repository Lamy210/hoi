# Proposal

## Why
Phase 1の中核である「部隊作成・移動・宣戦・簡易戦闘・領域占領」を実装する。戦争の最小核が動くことで、AI（Change 5）とUI（Change 7）がゲームとして検証可能になる。兵站を主要戦略要素とする要件に従い、簡易補給（到達性＋距離減衰）をこの段階から導入する（拡張は同じAPI契約で置換する、docs/03 §5）。

## What Changes
- `src/engine/military/` にUnitStore（師団SoA）・作成コマンド（人力/装備の実消費）・移動（合法性検証・経路・移動時間）・戦線の簡易版（割当＋スタンス）を実装する
- `src/engine/military/war.ts` に宣戦コマンド（CB有無でペナルティ差）・戦争状態の管理を実装する
- `src/engine/combat/` にプロヴィンスバトルの日次解決（決定論ロール・地形/補給/装備係数・トレース）・撤退・占領タイマを実装する
- `src/engine/logistics/` に簡易補給（Dijkstra到達性＋距離減衰・dirty再計算）と消費側適用を実装する
- MVP用の装備財（歩兵装備）を現代東アジアパックに追加する

## Capabilities
### Modified Capabilities
- `military-system`: 師団作成・移動・宣戦の機能要件を追加
- `combat-system`: 日次解決・占領・撤退の機能要件を追加
- `logistics-system`: 簡易補給の初期実装・包囲の機能要件を追加

## Impact
- **対象Phase**: 1 の 4/7（Phase 1の中核）
- **後続依存**: ai（Change 5）は軍事コマンドを、ui（Change 7）は戦争状況表示を利用する
- **リスク**: R-07（資源不正生成）: 作成・装備は全て実消費。R-09（owner/controller不整合）: 占領はcombatからの一経路で適用
