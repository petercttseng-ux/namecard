# Supabase 共用名片庫設定

程式已支援 Supabase，但此專案尚無實際 Supabase 專案及連線資料。GitHub 儲存庫名稱不是資料庫網址。

## 1. 建立同一個 Supabase 專案

登入 https://supabase.com/dashboard 並選擇 New project，設定組織、名稱、地區與資料庫密碼。密碼請留存在您自己的密碼管理工具，不要貼到聊天或 GitHub 程式碼。待資料庫建立完成後繼續。

## 2. 建表及啟用權限

在該專案 SQL Editor 開啟新查詢，貼上本目錄的 `schema.sql` 並執行。腳本使用獨立名稱：

- `public.namecard_contacts`：共用名片（包括照片資料），不按帳號分成不同名片庫。
- `public.namecard_members`：有權讀寫此名片庫的登入帳號。
- `public.namecard_import`：原子批次匯入 RPC，重複識別碼會略過。

腳本可重跑；不要在不明的既有專案盲目覆蓋其他同名物件。應先在新建的專屬專案執行。

資料表啟用 Row Level Security：匿名或未加入名單的帳號不能讀寫，只有已授權成員可共用名片；網站沒有自行加入成員或自行註冊的入口。

## 3. 建立可登入帳號

在 Authentication → Users 建立使用電子郵件／密碼的使用者，或邀請使用者並完成密碼設定。請確保帳號可使用密碼登入；若需確認電子郵件，請先完成確認。複製該使用者 UUID，回 SQL Editor 執行：

```sql
insert into public.namecard_members(user_id)
values ('換成 Authentication 使用者 UUID')
on conflict do nothing;
```

需要共同存取同一庫的其他帳號，也以相同步驟加入。若要撤銷權限，管理員可在 SQL Editor 刪除其 `namecard_members` 紀錄。

## 4. 設定網站連線

從專案設定的 API / Data API / API Keys 頁面取得：

- Project URL：`https://你的專案代碼.supabase.co`
- Publishable key（`sb_publishable_...`）或舊版 `anon` 公開金鑰。

**不要使用 `service_role`、`sb_secret_...`、資料庫密碼或管理 API Token。** 前端只接受公開金鑰，資料保護由登入及資料庫 RLS 負責。

建議在 GitHub 儲存庫 **Settings → Secrets and variables → Actions → Variables** 建立：

| Repository variable | 內容 |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable / anon 公開金鑰 |

執行 Actions 中的 Pages 部署流程；流程會將兩個公開設定寫入網站的 `supabase-config.js`，所有裝置便使用同一專案。缺少任一設定會阻止不完整的部署；兩者皆空時網站顯示首次連線設定。

尚未設定 GitHub Variables 時，也可先在網站「首次使用：資料庫連線設定」輸入網址及公開金鑰，設定只保存在該瀏覽器。每台裝置需輸入相同專案資訊；正式使用建議採上面的統一部署設定。

## 5. 登入與搬移

使用步驟 3 的帳號登入。若此瀏覽器有舊名片，點「搬移本機名片」，確認後才寫入雲端。原資料不會刪除；示範名片不搬移，相同識別碼重複搬移不會覆蓋雲端資料。可先在登入視窗下載原本機備份。

其他裝置使用同一網站與授權帳號登入後，即可讀取同一份名片。點「重新整理」取得其他裝置更新；頁面可見且沒有開啟編輯視窗時，每 30 秒自動更新。這是輪詢同步，不是 Realtime 訂閱。

## 儲存與衝突行為

- 名片及照片都儲存在同一個 Supabase PostgreSQL 資料表。照片以資料 URI 保存，單張限制 3 MB。此版本不另建公開 Storage bucket。
- 列表不載入全部照片，打開名片才載入其照片；匯出備份會分頁讀取完整資料。
- 兩台裝置同時編輯同一張名片時，使用版本檢查阻止過期覆寫。保留未送出的表單，供使用者核對或另行複製內容；關閉後重新整理取得最新資料。
- 寫入失敗不會顯示已儲存，也不會退回本機儲存。離線時請保留表單，恢復網路後重試。
- 網站只在本機保留公開連線設定及登入 Session。密碼不儲存；原名片資料僅為待搬移的舊資料。請在可信任裝置登入並於共用裝置使用後登出。
- 瀏覽器照片 OCR 仍在本機執行；按下儲存後，照片及確認過的欄位才上傳至所選 Supabase 專案。

## 驗證狀態

邏輯測試使用 `npm test`。本機 PostgreSQL 相容 PGlite 驗證涵蓋 RLS、版本觸發器、匿名／非成員拒絕、匯入去重與交易回滾。瀏覽器測試使用模擬 Supabase HTTP API，驗證兩個獨立瀏覽器 Session 的共用讀寫；不代表已測過真實 Supabase Auth、API、網路或部署。

可選回歸檢查（依賴只供測試，不是網站執行依賴）：

```sh
PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/verify-schema.cjs
# 先 npm start，再於另一個終端執行：
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node scripts/verify-cloud-browser.cjs
```

實際專案建好後，仍須驗證登入、新增、另一裝置讀取、照片、編輯與刪除。尚未完成這項正式連線驗證。

JSON 備份匯入採新增方式，不覆寫原有名片；同一備份重複匯入可能產生重複名片。只有「搬移本機名片」保留舊識別碼，適合安全重跑。JSON 匯入單檔上限 20 MB，資料量大時需分檔匯入。
