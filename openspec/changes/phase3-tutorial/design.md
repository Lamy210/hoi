# Design: phase3-tutorial

## Decisions

- **D-047 直列ガイド**: イベントIDを `tut-1`〜`tut-5` とし、各イベントのeffectsで次のイベントの `once解除` を行うのではなく、トリガー条件の積（先行IDがfiredEventsにある）で直列化。commandDoneトリガーはジャーナル参照（決定論）。
- **D-048 UI**: ガイドアラートはpriority=1（最上位）でalert feed先頭に固定表示するスタイルを追加。
