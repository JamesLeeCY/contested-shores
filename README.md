# 大員之圍 1661

以 1661–1662 年熱蘭遮城圍城為主題的瀏覽器即時戰略遊戲。四章戰役，鄭氏與荷蘭東印度公司（VOC）兩方都能玩；台江內海的潮汐、要塞的交叉火力、瘴癘與補給、原住民各社與漢人移民的立場，都會左右戰局。

線上試玩：<https://jamesleecy.github.io/siege-of-tayouan-1661/>

## 怎麼玩

| 操作 | 輸入 |
| --- | --- |
| 選取／框選 | 左鍵／左鍵拖曳（Shift 加選） |
| 移動、攻擊、採集、建造、進駐、登船 | 右鍵（依目標自動判斷） |
| 攻擊（點地面＝攻擊移動，火砲轟擊地面） | A ＋左鍵 |
| 停止／巡邏／建造／卸載／挖坑道 | S／P／B／U／K |
| 編隊／叫出編隊（連按兩下鏡頭跳轉） | Ctrl＋1–9／1–9 |
| 捲動鏡頭 | 方向鍵、滑鼠貼邊、中鍵拖曳 |
| 縮放 | 滾輪 |
| 暫停（暫停中仍可下指令） | 空白鍵 |
| 遊戲速度 | ＋／− |

指令面板（右下 3×4）每格右上角的字母是熱鍵。右上角的潮汐圓環、遊戲日與章節計時決定你的每一個決策：

- **潮汐**：漲潮時戎克船可走淺水道（鹿耳門），退潮時船會擱淺、步兵可以涉水。
- **要塞**：兩座以上稜堡覆蓋同一目標時傷害 +25%。正面強攻代價極高；挖壕溝、架砲台（火砲射程 +2）、搶制高點才是正解。
- **時間**：鄭軍每天都會因瘴癘減員；VOC 靠庫存、海上補給（主航道被封鎖就不來）與援軍。
- **島上不只兩方**：選取「社」或移民的糖廍可打開外交面板：贈禮、招撫、請求戰士。好感 ≥ 80 且領先對手 20 才會結盟，跌破 20 會轉為敵對並派人襲擾。

主選單也有兩種沙盒（兩軍對峙、從一座營寨開始經營），以及圖鑑、設定（音量、捲動速度、色盲模式）、讀取／匯入存檔。

## 史實說明

戰役依 1661 年 4 月鄭軍穿過鹿耳門、5 月普羅民遮城投降、夏秋 Caeuw 援軍反攻失敗、1662 年 1 月烏特勒支堡失守到 2 月 1 日和約的順序展開。每章結束會顯示「史實上發生了什麼」，圖鑑記錄每個單位、建築、人物與地點的史實背景、遊戲中的取捨與參考來源，並標示史料爭議（例如叛逃者 Radis 一事僅見於荷方記載）。

遊戲依規劃書第 2.4 節的原則撰寫：兩方都能玩、兩方的敘事都包含代價；原住民各社有名字與自己的選擇；不呈現虐殺；爭議會標示。審查紀錄見 [docs/CONTENT_REVIEW.md](docs/CONTENT_REVIEW.md)。

主要參考：Tonio Andrade, *Lost Colony*（2011）、Wikipedia: Siege of Fort Zeelandia、Atlas of Mutual Heritage、揆一《被遺誤的台灣》。

## 開發

需要 Node.js 22 以上。

```bash
npm install
npm run dev          # 開發伺服器
npm run validate     # 資料與地圖驗證
npm test             # 單元測試（Vitest）
npm run test:e2e     # 端到端測試（Playwright，需先 npm run build）
npm run build        # 輸出 dist/
npm run battle -- --chapter 2 --runs 20   # 無頭 AI 對戰統計
```

網址參數：`?chapter=1..4&faction=voc&difficulty=easy|normal|hard&skipCutscenes`、`?mode=sandbox`、`?mode=economy`。

### 架構

- `src/sim/`：純 TypeScript 的確定性模擬（20 Hz 固定步長、種子化亂數、只能經由指令改變狀態），不碰 DOM，可在 Node 中無頭執行與重播。ESLint 禁止在這裡使用 `Math.random`、`Date.now` 與 DOM。
- `src/render/`：PixiJS 等角繪製（只讀模擬狀態）。
- `src/ui/`：DOM 介面、輸入、選單、存讀檔、音效。
- `data/`：所有數值（單位、建築、科技、規則、地圖、劇本、圖鑑）都在 JSON 裡，程式不寫死數值；`scripts/validate-data.ts` 會檢查 schema 與交叉參照。
- `docs/DECISIONS.md`：規格沒寫到或前後不一致時的實作決策；`docs/PROGRESS.md`：各階段進度與驗收結果。

部署：推送到 `main` 時 GitHub Actions 依序執行資料驗證、地圖驗證、lint、單元測試、建置、Playwright 冒煙測試，全部通過才發佈到 GitHub Pages。
