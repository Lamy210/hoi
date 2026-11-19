# Proposal: phase2-fronts-logistics

## Why

Phase 1では州単位の個別命令のみで、前線規模の作戦（複数師団の一括運用）ができない。GDD §4.4の「過剰マイクロマネジメント回避」に必要な戦線指示、logistics-system baseline の capacityFactor（ハブ容量）を未実装のまま置いている。また戦争の帰結が白紙講和のみで、領土の最終帰属が決まらない。

## What Changes

- **戦線（Front）オブジェクト**: 国境区間（プロヴィンス集合）＋スタンス（防衛/攻勢/撤退）＋師団割当。戦線AIが週次で割当師団を再配置する。明示命令は戦線AIより優先（baseline要件どおり）。
- **攻勢計画**: 戦線に「目標プロヴィンス群＋投入上限」を宣言し、エンジンが経路と順序を計算する。
- **補給の capacityFactor**: ハブ（首都＋都市州）ごとの容量と師団の要求量から capacityFactor を計算し supplyEff に乗算（baseline式の実装）。過容量の師団は減衰。
- **割譲講和**: 戦争スコアの不均衡時に占領地の領有移転を要求できる（GDD §6「白紙講和＋割譲要求」）。
- **国家消滅（併合）**: 全領土占領＋無兵力の国家は併合され alive=false（Phase 1からの繰り込み）。
- UI: 地図への戦線ハイライト、戦線パネル（作成/スタンス/攻勢目標/解除）、講和UI拡張。
- セーブスキーマ v2（fronts・割譲・併合状態を含む）。

## Impact

- Affected specs: `military-system`（戦線・攻勢計画）、`logistics-system`（capacityFactor）、`diplomacy-system`（割譲講和・併合）
- Affected code: src/engine/military/fronts.ts（新規）、systems/fronts.ts（新規）、systems/logistics.ts（拡張）、military/war.ts（拡張）、commands.ts、core/state.ts（v2ストア）、save/serialize.ts（v2）、ui.ts、UI（GameScreen/panels/i18n）、ai/ai.ts（戦線経由へ移行）
