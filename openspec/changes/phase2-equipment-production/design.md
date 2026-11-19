# Design: phase2-equipment-production

## Context

Phase 1の抽象装備ストック（D-016）を2財へ置き換える。財市場（価格・貿易）はPhase 3（economy-system）であり、本Changeでは国庫ストック＋生産ラインのみ。

## Goals / Non-Goals

- Goals: 2財ストック・生産配分・テンプレート費用・火砲充填率の戦闘反映・指揮官
- Non-Goals: 価格形成・貿易・建物レベル・大隊単位のテンプレートエディタ（Phase 3+、MVPはテンプレート1種）

## Decisions

- **D-028 財**: `infEquipmentStock` / `artEquipmentStock` を国庫に追加（v2スキーマ）。旧 equipmentStock は廃止（save v2で移行しない）。
- **D-029 装備係数**: 師団の装備充填率 = `(infEq/maxInf) × (artEq/maxArt)` の幾何平均 `sqrt(infFill × artFill)`。トレースは2要素に分解して表示。
- **D-030 指揮官生成**: 名前プール（ja/en・架空名・balancedフラグ）から `deriveStream(seed, 'commanders', countryId)` で決定論生成。8人/国。割当はコマンド assignCommander。月次: exp>=1.0でスキル+1（max5、決定論ロール p=0.5）。
- **AI**: artShare固定0.2・師団作成時に空き指揮官を自動割当・判断ログに記録。

## Risks / Trade-offs

- 火砲不足でAI作成が止まる恐れ → AIは火砲<400でartShareを0.4へ一時引き上げ（判断ログ記録）。
- テンプレート1種の簡略化 → テンプレートエディタはPhase 3（docs/03 §4.1の段階どおり）。
