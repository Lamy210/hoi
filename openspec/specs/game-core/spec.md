# game-core 仕様

## Purpose
ゲームの決定論的な状態コンテナと、全システムが従う実行規律（コマンド適用・乱数・数値演算・スケジューリング・計算根拠）を提供する基盤能力。UIや個別ドメインの内容は一切知らない。

## Scope
### 責務
- WorldState（ストア集合）の保持とストア間参照の整合
- コマンドの受付・検証・適用・ジャーナル記録（uidによる二重適用防止）
- シード付き乱数（PCG32）とシステム別の子ストリーム派生
- システムスケジューラ（cadence / offset / dirty制御）
- 計算根拠（trace: contributors 配列）の型と純関数ユーティリティ
- 不変条件（docs/07 §5）の担保と検証API

### 非責務
- 個別ドメインの計算（経済・戦闘・外交等）は各システムの責務
- UI・レンダリング・永続化（直列化はsave-systemが担当）
- コマンドの種類定義（各ドメインがレジストリへ登録）

## Data Model
- WorldState: `{ tick, seed, rng[], stores..., derivedCache }`。derivedCache は再計算可能な値のみでセーブに含めない。
- Command: `{ uid(issuerId,seqNo), type, payload, issuer }`。ジャーナルは適用結果（適用/却下＋理由）を記録。
- ストアはSoA（typed array + parallel array）。エンティティクラスを持たない。

## State & Transitions
- コマンド: `queued → validated | rejected → applied → journaled`
- システム: `registered → enabled/disabled`（フラグ切替はスケジューラAPIのみ）

## Calculation Rules
- 乱数: `PCG32(hash(worldSeed, systemName, scope))`。`Math.random` 使用禁止。
- 数値: 連続量はfloat64の仕様確定演算（`+ - * /`・比較）のみ。超越関数（`Math.sin/cos/exp/log`等）禁止、必要時は整数インデックスのLUT＋線形補間。整数は2^53未満。
- 反復順序: すべてのループはID昇順固定。Set/Mapはソート後に使用。

## Invariants
- INV-2: 貨幣保存則（全帳簿の総和は不変）
- INV-3: 状態変更はコマンド経由のみ
- INV-6: 同一コマンドuidの二重適用禁止
- 同一(worldSeed, コマンド列) → 同一の状態ハッシュ列

## Use Cases
- 週次AIがutility評価 → コマンド発行 → 検証 → 適用。
- UIがコマンド投入し、trace要求で任意エンティティの計算根拠を取得。

## Anomalies & Error Handling
- 無効コマンド: 適用せずジャーナルに却下理由を記録（tickは継続）。
- 不変条件違反の検知: fail fast でtick中断し、デバッグ情報（状態ハッシュ・tick・コマンド履歴）を吐く。

## Dependencies
- 依存先: なし（最下層）。
- 依存元: すべてのシステム。

## Security & Performance
- 外部由来データ（セーブ・MOD）の範囲検証はロード側（save-system / mod-system）が実施し、エンジンは違反をfail fastで拒否する。
- tick内のオブジェクト割当を抑制（SoA配列走査を基本とする）。

## Acceptance & Tests
- リプレイ二重実行で全月末ハッシュアンカーが一致（CI必須）。
- 不変条件のプロパティテスト（fast-check、1,000ランダムシード）。
- スケジューラのオーバーヘッドがティアSで1ms未満（bench計測）。

## Requirements

### Requirement: コマンド経由の状態変更
システム・AI・UIは WorldState を直接書き換えてはならない（SHALL NOT）。すべての状態変更は、コマンドの検証を通じて適用されなければならない（SHALL）。

#### Scenario: 無効コマンドの却下
- **WHEN** 検証に失敗したコマンドがキューに存在する
- **THEN** エンジンは状態を一切変更せず、ジャーナルに「却下と理由」を記録する

### Requirement: 決定論的乱数
エンジンは Math.random を使用してはならない（SHALL NOT）。乱数は世界シードとシステム名から派生したPCG32ストリームから取得し、ストリーム状態はセーブ可能でなければならない（SHALL）。

#### Scenario: 同一シードでの再現
- **WHEN** 同一シード・同一コマンド列でシミュレーションを2回実行する
- **THEN** 全乱数消費時点の状態ハッシュが一致する

### Requirement: 決定論的数値演算
シミュレーション内の演算は、ECMAScript仕様で確定したfloat64演算と整数演算のみを使用し、実装依存の超越関数（Math.sin等）を用いてはならない（SHALL NOT）。

#### Scenario: 超越関数の使用検査
- **WHEN** シミュレーションコードに `Math.sin` 等の使用を検出する静的検査を実行する
- **THEN** 検査は違反を報告し、CIは失敗する

### Requirement: 計算根拠のトレース
主要な導出値の計算は、値と contributors（ラベル・値・式）を返す純関数として実装され、UIが任意エンティティのトレースを要求時に再計算して取得できる（SHALL）。

#### Scenario: 戦闘力の根拠表示
- **WHEN** UIがある師団の戦闘力のトレースを要求する
- **THEN** 基礎強度・装備・地形・補給・指揮官等のcontributorsが返る

### Requirement: スケジューラによる更新制御
エンジンは全システムを毎tick実行してはならない（SHALL NOT）。システムはcadence（日/週/月）とオフセット分散、dirtyフラグに従って実行され、実行順序は固定でなければならない（SHALL）。

#### Scenario: 週次システムの分散実行
- **WHEN** 7つの週次システムが登録されている
- **THEN** 各システムは週内の異なるtickに実行され、同一tickに全実行されることはない
