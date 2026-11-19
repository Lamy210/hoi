# Design: phase3-construction

## Decisions

- **D-045 プロジェクトモデル**: `{id, country, prov, type, cost, costPaid, daysTotal, daysProgress, paused}`。日次: 国庫から コスト/工期 を支払い（pay-as-you-go）、国庫<0でpaused（baseline「待機」）。支払いは資金移転（INV-2準拠・国庫→建設部門の帳簿内消滅はしない: 建設費は「消費」として世界の資金から減算するのではなく国庫から建設会社へ移転→サービスGDPに計上）。
- **D-046 占領州の建物**: 占領時にレベル不変・稼働0（GDP除外）。復旧はPhase 4。
