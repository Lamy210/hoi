# Proposal

## Why
全機能の土台となる決定論的シミュレーション基盤が存在しない。リプレイ・セーブ一致・将来マルチの前提である「同一シード＋同一コマンド列 → 同一結果」を最初に確立しなければ、後続の全Change（地図・軍事・AI・セーブ）が決定論 violations の修正でやり直しになるリスクを抱える。競合調査（docs/01）でOpenFrontの「決定論エンジンの独立パッケージ化」が最優先の参考機構と結論づけたため、Phase 1 の最初のChangeとして実装する。

## What Changes
- `src/engine/core/` に決定論コア（PCG32・LUT・SoA状態コンテナ・コマンドレジストリ・スケジューラ・トレース型）を実装する
- `src/engine/clock/` に固定Tick進行・日付変換（プロレプティック・グレゴリオ整数演算）・速度段階・一時停止を実装する
- コマンドの「検証→適用→ジャーナル」パイプラインとハッシュアンカー（月末状態ハッシュ記録）を実装する
- Node上で直接動作する `@orbis/bench` の最小ハーネス（1,000tick実行・ハッシュ出力）を作る
- UI・地図は本Changeのスコープ外（純粋なエンジン＋テスト）

## Capabilities
### Modified Capabilities
- `game-core`: ハッシュアンカー・コマンドジャーナル照会・システム登録APIの機能要件を追加
- `simulation-clock`: 月次境界・進行レート自動抑制・速度切替即時反映の機能要件を追加

## Impact
- **対象Phase**: 1（最小プレイ可能なゲーム）の1/7
- **後続依存**: `phase1-world-map-provinces` は本Changeの状態コンテナを、`phase1-military-combat-mvp` はコマンドキューとPCG32を利用する
- **リスク**: 決定論の規律違反（Math.random・超越関数・非決定論的反復）をここで機構的に防ぐ（lint + CI）。docs/15 R-01/R-02 の対策の本体
