## MODIFIED Requirements

### Requirement: チュートリアルのイベント実装

チュートリアルはイベント機構（条件トリガ・効果）で実装されなければならず（SHALL）、チュートリアル専用の別機構を追加してはならない（SHALL NOT）。トリガー `commandDone`（コマンド種別の発行実績）を利用し、プレイヤー国に対してのみ発火しなければならない（SHALL）。ガイドは直列に進み、完了条件の成立で次のガイドが発火しなければならない（SHALL）。

#### Scenario: チュートリアルの進行
- **WHEN** プレイヤーがガイド対象の操作を完了する
- **THEN** 次のガイドイベントが条件成立として発火する

## ADDED Requirements

### Requirement: commandDoneトリガー

event-systemは `commandDone` トリガー（パラメータ: コマンド種別）を提供しなければならない（SHALL）。トリガーはジャーナルの issuer==='player' かつ type一致を参照し、該当コマンドの発行で成立しなければならない（SHALL）。

#### Scenario: 師団作成ガイドの完了
- **WHEN** プレイヤーが createUnit コマンドを発行する
- **THEN** commandDoneトリガーが成立し、次のガイドが発火する
