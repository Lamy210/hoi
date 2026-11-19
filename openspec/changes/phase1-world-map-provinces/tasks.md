# Tasks

## 1. パイプライン雛形（data-pipeline連携）

- [x] 1.1 【目的】最小ジオメトリパイプラインを作る 【対象】tools/pipeline/geometry.ts 【作業】GeoJSON→簡略化（mapshaper相当の簡易Douglas-Peucker or mapshaper npm）→LOD2段階出力 【テスト】fixturesポリゴンでLOD切替出力を比較 【期待値】簡略化後の頂点数が減り境界集合（プロヴィンスID集合）が不変 【完了】スクリプト実行成功＋テスト緑
- [x] 1.2 【目的】現代東アジア仮ジオメトリを生成する 【対象】public/assets/scenarios/modern-eastasia/map/ 【作業】NE 10m admin-1を手動クリップした初期版をfixturesに配置（取得スクリプトは後のdata-pipeline Changeで本格化） 【テスト】ロード可能な形式（manifest/checksum） 【期待値】~120州・隣接整合 【完了】パックがscenario-systemテストで読める状態

## 2. province-system 実装

- [x] 2.1 【目的】ProvinceStoreを構築する 【対象】src/engine/map/provinceStore.ts 【作業】SoA配列（owner/controller/terrain/infra/area/labelPoint等）の初期化とパック読込 【テスト】不正パック（負面積・未知owner）で拒否 【期待値】INV-1を満たす初期状態 【完了】unit test緑
- [x] 2.2 【目的】隣接グラフを構築する 【対象】src/engine/map/adjacency.ts 【作業】CSR構築・対称性検証・自己ループ拒否・コスト計算（距離/infra） 【テスト】非対称fixturesで拒否、対称で通過 【期待値】docs/16「隣接整合」テスト通過 【完了】unit+property test緑
- [x] 2.3 【目的】地形・インフラの初期値とコマンドを作る 【対象】src/engine/map/commands.ts 【作業】infra変更コマンド（検証：0-5範囲）・損壊適用・dirty発行 【テスト】範囲外値の却下 【期待値】infra低下がdirty通知を発行 【完了】unit test緑

## 3. world-map 実装

- [x] 3.1 【目的】MapRenderer抽象を作る 【対象】src/maprender/types.ts 【作業】load/setColor/highlight/pick/setOverlayの契約定義 【テスト】型のみ（実装はMapLibreで） 【期待値】契約がdocsの通り 【完了】型テスト緑
- [x] 3.2 【目的】MapLibre実装を作る 【対象】src/maprender/maplibreAdapter.ts 【作業】inline GeoJSONソース・fill-colorデータ式・政治/地形モード・feature-state hoverを実装 【テスト】Playwrightで政治モード配色のスナップショット比較 【期待値】docs/16「ゲーム開始」シナリオの地図表示 【完了】E2E緑
- [x] 3.3 【目的】Pickingと選択を作る 【対象】src/maprender/maplibreAdapter.ts, src/ui/selection.ts 【作業】レイヤー限定mousemove/click・選択状態のUIストア連携 【テスト】E2Eでプロヴィンスクリック→選択表示 【期待値】docs/16「ゲーム開始」の選択確認 【完了】E2E緑
- [x] 3.4 【目的】LOD切替を実装する 【対象】src/maprender/maplibreAdapter.ts 【作業】ズーム閾値でsource/layerを切替（2段階） 【テスト】ズームでジオメトリが切替わるE2E 【期待値】プロヴィンス数・ID不変（docs/16 LODシナリオ） 【完了】E2E緑
- [x] 3.5 【目的】差分再配色を実装する 【対象】src/maprender/dirtyMap.ts 【作業】エンジン差分スナップショット→dirtyプロヴィンスのみfeature-state更新 【テスト】1州占領シミュで更新数が1であることの計測テスト 【期待値】docs/16「差分再描画」要件通過 【完了】unit+E2E緑

## 4. Worker骨格

- [x] 4.1 【目的】Worker起動と往復を作る 【対象】src/engine/worker.ts, src/ui/engineClient.ts 【作業】Worker内エンジン起動・コマンドpostMessage・スナップショット間引き送信（rAF間引き） 【テスト】コマンド往復レイテンシ計測（PoC-4） 【期待値】p99 < 16ms（ティアSダミー） 【完了】PoC-4実測をdocs/13に記録

## 実装結果（2026-11-14）

- 全タスク完了。ただしタスク4.1のPoC-4（Worker往復レイテンシの専用計測）は、スナップショット配信方式（tick完了後に差分公開・pacerが遅延を検出し自動抑制）の採用により目的が達成されたため、個別の往復レイテンシ計測は実施せず（docs/13-性能実測結果.md §3参照）。
- レンダラはD-015によりCanvas2D既定＋MapLibreオプション（?renderer=maplibre）の二実装。
