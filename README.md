# 德藏 · 曾振德副所長名片管理

名片資料庫使用 **Firebase**（Authentication + Cloud Firestore，專案 `namecard-96e85`）。網站本身是純前端，放在 GitHub Pages 即可運作，不需要自架主機。保留原本的本機 OCR、分類搜尋、備份及舊資料搬移功能。

## Firebase 一次性設定

1. **網頁設定**：Firebase 主控台 → 專案設定 → 一般 → 您的應用程式（網頁應用程式，若沒有請按「新增應用程式 → 網頁」），把 SDK 設定中的 `apiKey` 與 `appId` 填入 `firebase-config.js`。這組設定可公開，不是密碼；資料權限由安全規則控制。
2. **Authentication**：建構 → Authentication → Sign-in method → 啟用「電子郵件/密碼」。在「Users」分頁新增要使用名片庫的帳號（沒有公開註冊）。
3. **Firestore**：建構 → Firestore Database → 建立資料庫（建議位置 `asia-east1` 台灣），選「正式版模式」。
4. **授權帳號**：在 Firestore 新增集合 `members`，文件 ID 填該帳號在 Authentication 的「使用者 UID」，欄位可放 `email`（字串）。只有 `members` 裡有紀錄的帳號才能讀寫名片。
5. **安全規則**：把 `firestore.rules` 內容貼到 Firestore → 規則 → 發布；或安裝 Firebase CLI 後在專案目錄執行 `firebase deploy --only firestore:rules`。
6. **授權網域**：Authentication → 設定 → 已授權網域，確認包含 `petercttseng-ux.github.io`。

完成後推送到 `main`，GitHub Actions 會自動測試並部署到 GitHub Pages。若 `firebase-config.js` 尚未填入 `apiKey` / `appId`，部署會停止並提示。

## 本機測試

```sh
npm run dev   # 開啟 http://localhost:8000
```

`localhost` 預設已在 Firebase 授權網域內。

## 資料與權限

- 名片存於 Firestore `contacts` 集合；照片另存於 `photos` 集合，列表不載入照片，開啟名片才讀取。
- Firestore 單筆上限 1 MiB，照片儲存前自動壓縮至約 900 KB 以下（上傳原圖仍限 3 MB）。
- 所有授權帳號共用同一份名片庫；不同裝置同時編輯會檢查版本，阻止過期覆寫。
- 原瀏覽器名片會保留；登入後可明確確認搬移，示範資料不搬移。重複搬移或重複匯入相同識別碼不會重複新增。
- 可按「重新整理」同步其他裝置更新；頁面可見且沒有開啟對話框時，每 30 秒更新。
- Firebase SDK 隨專案提供於 `vendor/firebase/`，不依賴外部 CDN。
- Spark 免費方案（每日 5 萬次讀取、2 萬次寫入、1 GiB 儲存）對個人名片庫足夠。

## 驗證

```sh
npm test
```

測試以記憶體中的 Firebase 替身驗證登入、授權、CRUD、照片分存、版本衝突、匯入去重與照片大小限制，不連線正式資料庫。

## 名片照片自動建檔

在「新增名片」上傳 PNG / JPEG / WebP 照片（最大 3 MB），即啟動繁體中文及英文 OCR，辨識姓名、職稱、機構、電話、電子郵件、地址；分類由機構名稱推估。完成後請逐欄核對再儲存。未辨識出的欄位留空，收藏及交流備註由使用者填寫。

辨識會保留人工輸入與修正。重新辨識或切換辨識版本後擷取，可更新同次編輯中尚未人工修改的自動填值；重新開啟既有名片時，既有資料會受到保護，如需替換某欄可清空後重辨。可展開「辨識原文與欄位確認」，修正原文後再更新辨識欄位。低解析度、傾斜、直排、反光或複雜版面可能造成誤辨，無法保證完全正確。

OCR 使用隨專案提供的 Tesseract.js 5.1.1 與 tessdata_best 4.1.0 繁體中文、英文浮點高精度模型，在瀏覽器 Web Worker 執行，不上傳照片。首次辨識需從本站載入約 30 MB 的辨識檔案；瀏覽器可快取語言資料。檔案來源及授權見 `vendor/ocr/README.md`。


### 辨識品質改善

- 自動放大小字（最高 3 倍、長邊約 2200 像素）、對比拉伸與深色底反相，保留彩色原圖作為另一版輸入。
- 分散文字與整體版面各辨識一次，綜合引擎信心及可擷取欄位數選擇結果；可從原文區切換另一版。
- 「左轉／右轉 90°」與「框選名片範圍」可排除桌面背景並修正拍攝方向；照片處理後重新辨識。
- 使用新語言模型快取名稱，避免瀏覽器沿用舊版低精度模型。
- 顯示引擎信心分數與低信心提示；此分數不等於實際辨識準確率，不應作為免人工核對的依據。

驗證涵蓋單元測試及 Chromium 實際圖片辨識。五張合成測試圖（小字、深色底、雙欄、輕度模糊、極小模糊文字）的五項欄位精確比對，由舊版 19/25 提升為新版 22/25；雙欄由 3/5 改為 5/5，極小模糊圖仍僅 2/5。這是有限的合成回歸案例，不能推論真實名片準確率。嚴重模糊、透視變形及直排文字仍可能需要重拍或人工修正。

合成回歸測試結果保存在 `docs/ocr-validation.json`。可在已安裝 Playwright 與 Chromium 的開發機器，以 `python3 -m http.server 3000` 啟動網站後執行 `node scripts/benchmark-ocr.cjs` 重現；預設使用 `/usr/bin/chromium`，可用 `CHROMIUM_PATH` 指定。若 Playwright 安裝於其他路徑，可透過 `PLAYWRIGHT_MODULE` 指定套件路徑。此檢查需較多時間與記憶體，不是一般使用所需；一般邏輯測試仍使用 `npm test`。
