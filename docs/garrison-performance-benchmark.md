# 駐屯AIの性能ベンチマーク

## 実行方法

`npm run bench` で駐屯AIの性能を測定できます。既存の `package.json` の `bench` スクリプトで実行する `tools/bench.ts` に、独立した測定CLIを実装しています。

```sh
npm run bench
npm run bench -- --iterations 10 --warmup 3 --format json
npm run bench -- --pattern stacked --units 256 --targets 64 --iterations 10
npm run bench -- --pattern distributed --units 48 --targets 16
```

- `stacked`：全師団が同一出発州に集結し、同じ経路への問い合わせが多いケース
- `distributed`：師団が異なる出発州に分散し、キャッシュによる重複排除が効きにくいケース
- デフォルトでは両パターンでそれぞれ **256師団・64防衛地点** を測定。先行のウォームアップ2回を除く7回の所要時間からp50/p95を求める
- 合法陸路の `routeRequests`、実際の `pathSearches`、`cacheHits`、`unreachableSearches` を計上。ヒット率は `cacheHits/routeRequests`
- 同じ世界状態を繰り返し計画し、計画内容が一致しない場合やWorldStateハッシュが変化した場合は失敗する。命令は発行しない
- 出力の `heapDeltaKiB` はGCのタイミングで増減する参考値。確実なピークメモリ・確保量ではない

## 再現性と前提

ベンチマークは **modern-eastasia** の実際の110州・隣接グラフを使用します。ただし全州の支配者を1か国へ一時的に統一して通行可能性を固定する、**ゲーム本編のシナリオとは異なる合成配置**です。師団・駐屯作戦もベンチマーク用WorldStateへ追加し、元のパックやゲームセーブは変更しません。したがって「本編で256師団と64地点が自然に存在している」という根拠にはなりません。

計測は実行環境（OS、CPU、Node.js、温度、共有runner負荷、GC、バックグラウンド負荷）に依存します。**CIのp50/p95や検索回数を本番レイテンシSLOや性能保証に使わない**でください。比較する場合は同じランタイム・シナリオ・引数で複数回測り、可能なら独立したマシンでも再現を確認します。

今回のCIでは `npm run bench -- --iterations 2 --warmup 1 --format json` を実行し、測定ツールが標準の最大規模で動作することを確認します。2標本のp95は外れ値検知に十分ではありません。

## 評価・次の改善案

1. `stacked` と `distributed` の実経路検索回数、p50/p95を記録
2. 分散配置で検索回数が高い場合、対象目標の絞り込みまたは到達不能領域の事前判定を検証
3. 重要な防衛目標の取りこぼしがないか、配置の正しさ・守備隊保護・決定論の回帰テストを維持
4. 実際の戦争・外交・港湾・補給変化を含む別負荷で本番相当のベンチマークを追加

プロファイリング対象は `src/engine/military/garrisons.ts`、`garrisonBatchOptimization.ts`、`garrisonRouteCache.ts`。計測統計は呼び出し元が所有する通常オブジェクトで、WorldStateの永続状態・セーブ形式には追加していません。
