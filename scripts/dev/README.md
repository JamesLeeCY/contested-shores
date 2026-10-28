# 開發工具

平衡與除錯用的指令稿，都以 `npx tsx scripts/dev/<檔名>` 執行（`playthrough.mjs` 用 `node`）。跑大量種子前先確認 CPU 與記憶體負載，一次只跑一個。

| 指令稿 | 用途 |
|---|---|
| `sweep.ts <劇本> [場數] [覆寫…]` | 電腦對電腦跑 N 場，印出第一方（劇本 `factions[0]`）的勝率；`REASON=1` 印出各場結局。可用 `scenario.triggers.6.when.count=15`、`units.light_cannon.range=7` 這類路徑覆寫數值做敏感度測試。 |
| `branch-check.ts <劇本> <陣營> <選項> [場數]` | 開場就做某個劇本選項（如東寧的 `resist`、`luzon`）後的結局；`TRACE=1` 每 30 秒印出雙方各區域人數與城防。 |
| `trace-scenario.ts <劇本> [種子] [間隔秒數]` | 1683 以後劇本的戰況追蹤：各區域兵力、陣亡、結局。 |
| `trace-chapter.ts <章> <種子> <秒數>` | 1661 各章的 AI 步驟與兵力追蹤。 |
| `battle-log.ts <劇本> [種子] [秒數]` | 誰殺了誰（單位種類與地形）、各單位造成的傷害。 |
| `deaths.ts <章> <秒數>` | 一方人口損失的原因分類。 |
| `replay-check.ts [tick 數]` | 存檔重播檢查：只重播玩家指令，印出第一個分歧的 tick。 |
| `profile-chapter.ts <章> <tick 數>` / `profile-systems.ts` | 各模擬系統的耗時。 |
| `ai-timing.ts [劇本…] [--seeds N]` | 各劇本 AI 決策耗時（p50／p99／最大值，以及最慢的一次是哪一層、在第幾秒）。 |
| `bench-site.ts` | 效能基準。 |
| `playthrough.mjs <網址>` | 在部署好的網站上自動跑一輪。 |
