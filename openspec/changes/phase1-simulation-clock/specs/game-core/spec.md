# Spec Delta

## ADDED Requirements

### Requirement: ハッシュアンカーの記録
エンジンは毎ゲーム月末に状態ハッシュ（主要ストアの逐次ハッシュ）をアンカーとして記録し（SHALL）、照会APIを提供しなければならない（SHALL）。

#### Scenario: 月末アンカーの一致
- **WHEN** 同一シード・同一コマンド列で2回1,000tickを実行する
- **THEN** 記録された全月末アンカーが一致する

### Requirement: コマンドジャーナルの照会API
ジャーナルはコマンドuid・発行者・適用/却下・理由を記録し（SHALL）、デバッグ用にtick範囲で照会できなければならない（SHALL）。

#### Scenario: 却下理由の照会
- **WHEN** 開発者がtick 100〜110のジャーナルを照会する
- **THEN** 却下されたコマンドとその理由が一覧で返る

### Requirement: システム登録API
スケジューラはシステムを「名前・cadence・offset・enabled」で登録し（SHALL）、登録順とハッシュ派生offsetによって実行順序が決定論的に定まる（SHALL）。

#### Scenario: 登録順の決定論性
- **WHEN** 同じシステム集合を同じ順で2つのインスタンスに登録する
- **THEN** 両者の実行順序は完全に一致する
