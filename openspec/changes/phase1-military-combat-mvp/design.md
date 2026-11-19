# Design

## Context
Phase 1は陸軍のみ。戦闘はプロヴィンス単位バトル、前面幅は地形別定数。補給はMVP方式（docs/03 §5.1）で、容量つきフローへの置換はAPI契約を保ったまま後Phaseで行う。

## Goals / Non-Goals
- Goals: docs/16の軍事系受入シナリオ（作成/移動/宣戦/戦闘/占領/包囲）がテストで通ること
- Non-Goals: 海軍・空軍（Phase 4）、指揮官詳細・天候（Phase 2）、装備の細分化（テンプレートはPhase 2）

## Decisions
- **移動表現**: 師団は「セグメント先頭プロヴィンス＋残距離」を保持（パス毎tick再構築を避ける）。移動中は戦闘不参加。
- **前面幅**: plains 10 / hills 6 / mountains 4 / urban 5（docs/03 §4.3）。超過分は予備として待機。
- **決定論ロール**: battleId単位の子ストリーム `hash(seed,"combat",battleId)`。損耗式の係数はcontributorsに全て記録（トレース要件）。
- **占領**: 14日タイマ（パック定義可）。controller移転はcombat-systemから「occupyProvince」コマンド発行のみ。
- **補給MVP**: ソース=首都、radius=パック定義（既定 infra5×4）、再計算=週次＋dirty。包囲=supplyEff 0 でorg回復停止＋崩壊損耗。
- **装備財**: MVPは「歩兵装備」1種のみをパックに定義（Phase 2で拡張）。

## Risks / Trade-offs
- 損耗式のバランスは初期値（docs/03 §12）からプレイテストで調整。ゴールデンテストで式変更時の逸脱を検知。
- 簡易補給は「距離減衰のみ」なので鉄道戦略感は薄い → Phase 2でハブ・鉄道を導入（logistics spec の拡張要件）。
