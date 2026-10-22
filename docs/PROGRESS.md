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

## 階段 1：地圖與鏡頭（2026-10-22）

**完成**
- `scripts/gen-map.ts` 依第 6.3 節產生 Tiled 1.10 JSON（`data/maps/taijiang.json`）與佔位地形圖塊 `assets/tiles/terrain.png`
- `src/sim/map.ts`（Tiled 載入）、`src/sim/path/navgrid.ts`（6 張導航圖）、`src/sim/mapcheck.ts`
- PixiJS 等角地形繪製（16×16 區塊）、鏡頭（方向鍵、滑鼠貼邊、中鍵拖曳、滾輪 0.5×–1.5×）、小地圖（點擊／拖曳跳轉、視野框）
- `scripts/validate-map.ts` 第 6.4 節五項檢查

**驗收**
- `validate-map` 五項全過；`tests/map.test.ts` 另驗證把鹿耳門挖深時檢查會失敗
- 縮到 0.5× 時 60 FPS（瀏覽器實測）

## 階段 2：單位、選取、移動、潮汐（2026-10-22）

**完成**
- `world.ts`（實體、勢力、潮汐狀態、空間雜湊、指令佇列）、`loop.ts`（20 Hz 固定步長、FixedStepper）、`rng.ts`（mulberry32）、`commands.ts`（指令登錄表，move/stop）、`hash.ts`
- 尋路：6 張導航圖、A*（8 方向、對角 1.414、不切角、視線平滑）、flow field（>8 單位）、確定性節點預算佇列
- 潮汐循環（漲 90／滿 30／退 90／乾 30 秒）、擱淺、潮位改變時重新尋路
- 繪製：單位／船／建築佔位圖、選取框、血條；左鍵點選／框選、Shift 加選、右鍵移動、Ctrl+1–9 編隊、1–9 叫出（連按跳轉）、空白鍵暫停、＋／− 速度
- 右上時鐘群：潮汐圓環＋倒數、遊戲日、速度

**驗收**
- 確定性：同種子＋同指令 6,000 tick、每 100 tick 狀態雜湊一致；指令紀錄重播一致（`tests/determinism.test.ts`）
- 戎克船只能在漲潮進出鹿耳門，大船永遠不行；退潮擱淺、漲潮浮起（`tests/movement.test.ts`）
- 效能：100 步兵＋20 艘船同時移動，每幀 sim 1.0 ms＋同步 0.5 ms＋WebGL 繪製 2.7 ms ≈ 4.2 ms（60 FPS 預算 16.7 ms）。內嵌瀏覽器窗格隱藏時被節流成 30 FPS，故以每幀耗時為準
- Playwright：框選＋右鍵移動

## 階段 3：經濟與建造（2026-10-22）

**完成**
- 四種資源；採集（農田、鹿群、樹林格）、攜帶 10、送回最近倉庫類建築；資源枯竭自動找附近下一處
- 建築放置（地形、佔用、臨水、勢力、階段、成本檢查）、建造進度、多人建造
- 生產／研究佇列（上限 5、取消退款）、集結點、人口上限與人口不足暫停
- 每日糧食消耗與斷糧士氣懲罰、屯田（進駐、產糧、10 秒召回）、火藥坊、鹿群每日恢復
- 科技效果引擎（規則、單位數值、建築砲、地形揭露）
- 介面：頂部資源列（斷糧閃紅）、選取面板（單選詳情／多選格、生產佇列與取消）、3×4 指令格（熱鍵）、建造子選單、放置預覽、右鍵採集／建造／駐軍／集結、訊息區
- 首頁 `?mode=economy`：一座營寨＋6 名民夫

**驗收**
- `tests/economy.test.ts`：600 秒後資源總量與手算一致（屯田＋火藥坊＋每日消耗精確相等；單一民夫農田採集 336 tick 循環 → 35 趟，精確相等）
- 從 1 座營寨採集木材 → 蓋兵營 → 生產藤牌兵（單元測試＋瀏覽器實測）

## 階段 4：戰鬥與攻城（2026-10-22）

**完成**
- 攻擊流程（指定攻擊、攻擊移動、攻擊地面、巡邏、自動索敵與追擊）、第 4.5 節傷害公式與倍率表、命中判定、火藥消耗與斷藥近戰
- 全部 traits（`src/sim/traits/` 每個一檔）：格擋、橫掃、齊射、反衝鋒、架設、限砲台、舷砲、自爆火船、濺射、林中隱蔽、地形無懲罰、運輸
- 建築砲（主堡、稜堡、烏特勒支、普羅民遮）、稜堡交叉火力、霰彈科技、駐軍射擊
- 士氣（陣亡 −3、擊殺 +2、英雄光環、潰逃 10 秒）、VOC 城內士氣、揆一光環
- 壕溝掩護、砲台加成、坑道（挖掘、引爆 1,500、反坑道偵測）、高地加成、據點佔領
- 運輸（登船、卸載、隨船陣亡）
- 三態戰爭迷霧（樹林阻擋視線、林中隱蔽、何斌海圖揭露淺水道）
- 畫面：火槍白煙、砲彈與煙、爆炸、水花、陣亡淡出；迷霧覆蓋層與小地圖迷霧；稜堡射程覆蓋顯示；攻擊／巡邏／卸載／坑道按鈕

**驗收**
- `tests/combat.test.ts`：傷害公式 26 個手算案例＋trait 行為（共 36 項）
- 要塞是謎題（`tests/siege.test.ts`，5 個種子實測）：40 名藤牌兵正面衝擊 2 座稜堡交叉火力 → 損失 40/40（兩座稜堡都沒倒）；同樣兵力待在壕溝、4 門重砲在砲台上轟掉稜堡後再推進 → 損失 0/40
- 效能：152 單位交戰約 1.2 ms/tick（`scripts/dev/profile-systems.ts`）

**已知問題**
- 正面強攻完全無望（連一座稜堡都打不下），平衡留到階段 9 調整
