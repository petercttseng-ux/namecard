# SQLite 共用名片庫部署

## 選擇部署方式

本系統需要 **一個常駐 Node.js 24 程序與一個持久化 SQLite 檔案**。可部署至公司主機、NAS、VPS，或提供持久磁碟且可執行 Node.js / Docker 的服務。這個儲存庫不會自行購買或建立雲端主機。

GitHub Pages 不支援後端或持久化資料庫。若目前只有 Pages 網站，仍需要另外部署下列後端；不能將 `.sqlite` 上傳至 GitHub 當作共用資料庫。

請使用單一應用實例，所有裝置連到同一個網址與同一份 SQLite。不要在多台主機各建一份獨立檔案，也不要把 SQLite 資料檔放在 NFS 或多副本網路磁碟上。

## 方式一：直接執行 Node.js

1. 安裝 Node.js 24 以上並取得本儲存庫。
2. 將 `.env.example` 複製為 `.env`，設定自己的管理員 email 與至少 12 字元密碼。密碼不需傳給開發者，不應提交至 Git。
3. 執行 `npm start`，預設監聽 3000 埠，資料庫自動建於 `data/namecard.sqlite`。
4. 用反向代理設定正式網域與 HTTPS，將請求轉送到 Node.js 3000 埠。將服務註冊為系統常駐程序並設定重新啟動。
5. 使用設定的帳號登入。第一次有空資料庫才會初始化管理員；更換環境變數不會重設已存在的密碼。

網站與 API 同一網域時不需設定前端連線網址；所有裝置用這個網址登入即可。

主要設定：

| 變數 | 用途 |
| --- | --- |
| `NAMECARD_DB_PATH` | 持久 SQLite 檔案路徑；預設 `data/namecard.sqlite` |
| `NAMECARD_ADMIN_EMAIL` | 第一次啟動建立的登入帳號 |
| `NAMECARD_ADMIN_PASSWORD` | 第一次啟動的密碼，至少 12 字元 |
| `PORT` | HTTP 埠，預設 3000 |
| `ALLOWED_ORIGINS` | 允許連接此 API 的其他前端 origin，逗號分隔，不含路徑；同網域不必設定 |

### 新增共同使用者

使用自己的環境值，在伺服器執行 `npm run user:add`。此命令讀取 `NAMECARD_ADMIN_EMAIL`、`NAMECARD_ADMIN_PASSWORD`，建立另一個可存取同一名片庫的帳號；同 email 已存在時拒絕覆寫。它不會將密碼印出，也不會重設已有帳號。

## 方式二：Docker Compose

儲存庫包含 `Dockerfile` 與 `compose.yaml`：

```sh
cp .env.example .env
# 編輯 .env，填入自己的帳號與密碼
docker compose up -d --build
```

SQLite 位於 named volume `namecard-data` 的 `/app/data/namecard.sqlite`，容器重建不會刪除資料。**不要執行 `docker compose down -v`，該命令會刪除資料卷。** Compose 的主機埠預設只綁 `127.0.0.1:3000`，請在主機設定 HTTPS 反向代理。

Docker 設定已提供；本次驗證以實際 Node.js 程序與 SQLite 執行，尚未在此環境建置 Docker image。

## GitHub Pages 前端保留方式

1. 先完成以上任一後端部署，取得可公開連線的 **HTTPS 後端網址**。
2. 後端環境設定 `ALLOWED_ORIGINS=https://petercttseng-ux.github.io`。
3. GitHub → Settings → Secrets and variables → Actions → Variables，設定 **`NAMECARD_API_URL`** 為後端網址，不含 `/api` 路徑。
4. 執行 Pages 部署流程。前端不再使用 Supabase URL、publishable key 或任何第三方 API key。

也可先從網站的「後端伺服器設定」輸入後端根網址；這只保存在該瀏覽器。正式使用建議採統一部署設定，避免不同裝置連到不同資料庫。

沒有後端時，Pages 網站無法完成登入，並會提示需要名片 API；不會把新名片偷偷改存 localStorage。

## 備份與恢復

SQLite 使用 WAL 模式。不要在服務寫入時只複製 `.sqlite` 而漏掉 WAL；請使用：

```sh
npm run backup -- /安全備份目錄/namecard-backup.sqlite
```

腳本使用 SQLite `VACUUM INTO` 產生一致性備份，檔案包含名片、照片、帳號與 Session，應妥善保護並另存於主機以外的位置。目的檔案已存在時會拒絕覆寫。

恢復時先停止服務，將備份還原為 `NAMECARD_DB_PATH` 指定的檔案，確保檔案權限可由服務帳號讀寫，清理舊資料庫對應的 `-wal`、`-shm` 後再啟動。不要在服務仍運作時替換檔案。

也可使用網站 JSON 匯出／匯入名片；JSON 不包含登入帳號及 Session。

## 舊名片搬移與部署狀態

- 舊 localStorage 資料不會自動刪除，上傳須由使用者明確按「搬移本機名片」。若換了網址，先從原網站匯出，再於新網站匯入。
- 本次未搬移 Supabase 資料。若您曾自行存入其他資料，請先匯出後再於新系統匯入。
- 程式與部署檔已準備，真實 Node.js / SQLite 測試已執行；尚未部署到外部常駐主機。正式對外網址需要後端主機與 HTTPS 設定完成後才能驗證。
