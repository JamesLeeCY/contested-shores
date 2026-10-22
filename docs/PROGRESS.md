# 進度紀錄

## 階段 0：專案骨架（2026-10-22）

**完成**
- Vite＋TypeScript（strict）專案、第 10.2 節資料夾結構
- ESLint（`src/sim/` 禁用 `Math.random`、`Date.now`、`performance.now`、DOM 全域與 render/ui/pixi 匯入）、Prettier、Vitest、Playwright
- `data/units.json`（23）、`buildings.json`（16）、`techs.json`（12）、`rules.json`、`factions.json`、`ai_plans.json`；zod schema 在 `src/data/schema.ts`
- `scripts/validate-data.ts`：schema＋交叉參照（producedAt、produces、researches、tech effects、英雄、i18n key）
- GitHub Actions：validate → lint → test → build → Playwright 冒煙 → Pages

**驗收**
- `npm run validate` 通過
- `tests/data.test.ts` 驗證寫錯 id 時驗證失敗
- 冒煙測試：頁面開啟空白畫布、無 console 錯誤

**已知問題**
- 部署網址待 GitHub repo 建立後確認
