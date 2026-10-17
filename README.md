# 德藏 · 曾振德副所長名片管理

繁體中文名片管理應用程式，使用原生 JavaScript 與 Node.js，無第三方執行相依套件。

## 啟動

需求：Node.js 20 以上。

```sh
cd /workspace/namecard
npm start
```

預設連接埠 3000，可透過 `PORT` 調整。執行 `npm test` 驗證資料匯入驗證與搜尋篩選邏輯。

## 功能

- 新增、編輯、刪除名片，上傳名片圖片，記錄交流備註。
- 即時搜尋、分類篩選、重要聯絡人、最近 30 天新增、卡片及列表檢視。
- JSON 備份匯出與增量匯入、個別名片 vCard 下載。
- 桌面及行動裝置版面、鍵盤操作、搜尋快速鍵 Ctrl / Cmd + K。

首次開啟含六筆明確標示的虛構示範資料。可逐筆刪除或編輯。

## 資料與部署範圍

資料及照片只存於目前瀏覽器的 localStorage，不會傳送至伺服器。切換瀏覽器或裝置不會同步；清除網站資料會遺失名片，請定期匯出備份。瀏覽器儲存額度有限，建議壓縮照片後上傳。匯入採新增方式，不會覆寫既有名片；重複匯入會產生重複名片。

目前為單人本機版本，沒有登入驗證、雲端同步、OCR 辨識或多人權限功能。Node 伺服器只提供靜態應用程式，不保存聯絡資料。字型使用 Google Fonts，無網路時會使用系統字型。

## GitHub Pages 部署

專案包含 `.github/workflows/pages.yml`。在 GitHub 儲存庫的 Settings → Pages → Build and deployment 將 Source 設為 GitHub Actions。推送 `main` 後會先執行測試，再發布靜態網頁。若第一次推送時尚未啟用 Pages，請在設定完成後從 Actions 手動執行 Deploy contact manager to GitHub Pages。

部署只包含 `index.html`、`style.css`、`app.js`、`contacts.js`，不需要 Node.js 伺服器。GitHub Pages 網址與本機網址的瀏覽器資料各自獨立，移轉既有名片時請先匯出 JSON，再於新網址匯入。
