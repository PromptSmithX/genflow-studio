# Task P6: Đóng gói exe "zero-config" — nhúng key đã mã hóa vào bộ cài

> **Dành cho agent thực thi.** Làm trên branch `feature/deploy_gpu` (worktree hiện tại, tip `dc82318`). Ngữ cảnh: app đã chạy thật với RunPod Serverless. Bộ cài Electron (`npm run dist`) hiện bắt người dùng tự dán RunPod Endpoint ID/API key và LLM key ở Settings, còn R2/Google Sheets thì không có cách cấu hình trong exe. Mục tiêu: exe cài trên **máy tin cậy của chủ dự án**, mở lên dùng ngay, không lộ key plaintext trong bộ cài. Gặp mâu thuẫn thì chọn phương án an toàn và ghi lý do vào "Ghi chú của người thực thi".

## 0. Quy tắc bắt buộc
1. **Không commit secret.** `secrets/build-secrets.json` (file thật) nằm trong `/secrets/*` đã gitignore. Không đọc, in, hay log giá trị key thật ra terminal hoặc log. Test chỉ dùng giá trị giả (`"test-runpod-key"`, …).
2. Đọc `AGENTS.md` và `node_modules/next/dist/docs/` liên quan trước khi sửa code Next (API route).
3. **Chỉ sửa các file liệt kê ở mục 3.** Không đụng `deploy/runpod-serverless/` (vùng P5). Comment code tối đa 1 dòng. UI/thông báo giữ tiếng Việt. Giữ encoding UTF-8.
4. Commit nhỏ theo thứ tự: (a) spec này → (b) bịt rò rỉ (mục 3.1) → (c) crypto + encrypt script (3.2) → (d) `electron/main.js` (3.3) → (e) settings overlay + test (3.4) → (f) Google SA JSON (3.5) → (g) ghi chú.
5. **Không chạy `npm run dist`** và không chạy electron-builder. Chỉ chạy các lệnh ở mục 4.

## 1. Lý do / hiện trạng (reviewer đã kiểm)
- Secret app cần, và nơi đọc hiện tại:
  - RunPod `runpodEndpointId`, `runpodApiKey`, LLM `llmApiKey`/`llmBaseUrl`/`llmModel` → SQLite `AppSettings`, đọc **duy nhất** qua `getOrCreateSettings()` (`lib/settings.ts:9`), mọi caller đều đi qua hàm này.
  - R2 `R2_*` → `process.env` (`lib/r2/config.ts`).
  - Google `GOOGLE_SERVICE_ACCOUNT_FILE` (đường dẫn) + `GOOGLE_SHEET_ID` → `process.env` (`lib/sheets/config.ts`), tiêu thụ ở `lib/sheets/client.ts:3-5` (`keyFile`) và `lib/sheets/sync.ts:57`.
- **Rò rỉ tiềm ẩn 1:** `scripts/prepare-electron-resources.mjs` copy nguyên `.next/standalone` → `resources/app`. Next standalone tự chép `.env` gốc vào, nên nếu `.env` có key thì key nằm plaintext trong bộ cài (`resources/app/.env` hiện đã tồn tại).
- **Rò rỉ tiềm ẩn 2:** `electron-builder.yml` đóng gói `electron/**/*`, nên sẽ kéo theo `electron/secrets.json` nếu có.
- `electron/main.js:123-126` còn comment cũ về Colab gateway (sai).
- Giới hạn chấp nhận: key nhúng trong exe vẫn trích xuất được nếu quyết tâm. Mức bảo vệ là chống lộ vô tình, đủ cho máy tin cậy.

## 2. Thiết kế
```
[build]  secrets/build-secrets.json (gitignored, plaintext, chỉ trên máy build)
           └─ scripts/encrypt-secrets.mjs ─AES-256-GCM─► resources/secrets/secrets.enc
[cài]    secrets.enc ship qua extraResources → <resources>/secrets/secrets.enc
[chạy]   electron/main.js decrypt trong RAM ─► env của process con (Next server)
           └─ getOrCreateSettings(): cột DB rỗng → lấy process.env.ANIMA_*
```
Key không bao giờ ghi plaintext xuống đĩa máy người dùng và không ghi vào DB. Người dùng vẫn ghi đè được ở Settings (DB có giá trị thì DB thắng).

## 3. Thay đổi

### 3.1 Bịt rò rỉ
- `scripts/prepare-electron-resources.mjs`: sau `fs.cpSync(standalone, appDir, …)`, xóa mọi file `.env*` ở gốc `appDir` (dùng `fs.readdirSync` + lọc tên bắt đầu `.env`). In 1 dòng log số file đã xóa (chỉ tên file, không in nội dung).
- `electron-builder.yml`:
  - `files`: thêm `"!electron/secrets*.json"`.
  - `extraResources`: thêm `- from: resources/secrets` / `to: secrets` / `filter: ["secrets.enc"]`.
- Xóa `electron/secrets.example.json`. Có thể giữ dòng `/electron/secrets.json` trong `.gitignore`.
- Xóa comment sai ở `electron/main.js:123-126`.

### 3.2 Mã hóa lúc build
- File mới `electron/secrets-crypto.js` (CommonJS, vì `main.js` dùng `require`): xuất `encrypt(obj) → Buffer` và `decrypt(buf) → obj`.
  - AES-256-GCM qua `node:crypto`. Key 32 byte dẫn xuất bằng `crypto.scryptSync(<chuỗi hằng trong file>, <salt hằng>, 32)`. Định dạng file: `[1 byte version=1][12 byte iv][16 byte tag][ciphertext]`. Payload là JSON UTF-8.
  - `decrypt` throw nếu sai version hoặc sai tag.
- File mới `scripts/encrypt-secrets.mjs` (ESM, `createRequire` để nạp `electron/secrets-crypto.js`):
  - Đọc `secrets/build-secrets.json`. Không tồn tại → in cảnh báo tiếng Việt ("Không có secrets/build-secrets.json — exe sẽ yêu cầu nhập key thủ công"), **xóa** `resources/secrets/secrets.enc` cũ nếu có, rồi exit 0.
  - Chỉ nhận các key trong whitelist (bên dưới); bỏ qua giá trị rỗng; key lạ → cảnh báo (chỉ in tên key).
  - `GOOGLE_SERVICE_ACCOUNT_JSON`: nếu là object thì `JSON.stringify`; nếu là string thì kiểm tra `JSON.parse` được.
  - Ghi `resources/secrets/secrets.enc`; in danh sách **tên** key đã nhúng (không in giá trị).
- Whitelist: `ANIMA_RUNPOD_ENDPOINT_ID, ANIMA_RUNPOD_API_KEY, ANIMA_LLM_API_KEY, ANIMA_LLM_BASE_URL, ANIMA_LLM_MODEL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL, R2_KEY_PREFIX, GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON`.
- File mới `secrets/build-secrets.example.json` chứa đủ các key trên với giá trị rỗng. `GOOGLE_SERVICE_ACCOUNT_JSON` để `{}` kèm hướng dẫn trong README (mục 3.6). `.gitignore`: thêm `!/secrets/build-secrets.example.json` ngay sau `/secrets/*`.
- `package.json`: thêm script `"build:secrets": "node scripts/encrypt-secrets.mjs"` và chèn `npm run build:secrets` vào `dist` **trước** `electron-builder`.

### 3.3 Giải mã lúc chạy — `electron/main.js`
- `getPaths()`: thêm `secretsFile` (packaged: `path.join(resourcesDir, "secrets", "secrets.enc")`; dev: `path.join(root, "resources", "secrets", "secrets.enc")`).
- Hàm `loadEmbeddedSecrets(paths)`: file không tồn tại → `{}`; tồn tại → `decrypt(fs.readFileSync(...))`; lỗi → `console.error` (không in nội dung) và trả `{}`. Chỉ trả về các key thuộc whitelist, giá trị là string.
- `startServer()`: `env: { ...process.env, ...embeddedSecrets, NODE_ENV…, ANIMA_DATA_DIR…, DATABASE_URL… }`. Biến hệ thống quan trọng (`DATABASE_URL`, `PORT`, …) phải đặt **sau** spread để không bị ghi đè.
- Đóng gói: `electron/secrets-crypto.js` đã nằm trong `files: electron/**/*` nên không cần thêm.

### 3.4 Bơm vào settings — `lib/settings.ts`
- `getOrCreateSettings()` trả về row đã overlay (hàm thuần `applyEnvDefaults(row, env = process.env)` export riêng để test):
  - `runpodEndpointId ← ANIMA_RUNPOD_ENDPOINT_ID`, `runpodApiKey ← ANIMA_RUNPOD_API_KEY`, `llmApiKey ← ANIMA_LLM_API_KEY`, `llmBaseUrl ← ANIMA_LLM_BASE_URL`, `llmModel ← ANIMA_LLM_MODEL`. Chỉ áp khi giá trị DB là `null` hoặc chuỗi rỗng sau trim, và env có giá trị khác rỗng.
  - **Không** ghi giá trị overlay vào DB.
- `app/api/settings/route.ts` PUT: sau `prisma.appSettings.update`, trả `redactSettings(await getOrCreateSettings())` thay cho `redactSettings(updated)`, để UI vẫn thấy `hasRunpodKey`/`hasLlmKey` đúng khi key đến từ env.
- Kiểm tra (không bắt buộc sửa) `components/app-shell/connect-onboarding.tsx` và `components/settings/connection-card.tsx`, `llm-card.tsx`: xác nhận onboarding tự ẩn khi `hasRunpodKey && runpodEndpointId`. Nếu cần sửa thì ghi lý do vào Ghi chú.
- Test mới `tests/settings-env-defaults.test.ts`: (1) DB rỗng + env có → lấy env; (2) DB có → DB thắng; (3) env rỗng hoặc chỉ khoảng trắng → giữ null; (4) `redactSettings(applyEnvDefaults(...))` không chứa chuỗi key giả (kiểm `JSON.stringify`).

### 3.5 Google SA không cần file
- `lib/sheets/config.ts`: chấp nhận **một trong hai**: `GOOGLE_SERVICE_ACCOUNT_JSON` (ưu tiên) hoặc `GOOGLE_SERVICE_ACCOUNT_FILE`, kèm `GOOGLE_SHEET_ID` bắt buộc. Đổi config thành `{ credentials: object } | { serviceAccountFile: string }` (hoặc tương đương); `getSheetsStatus` báo `missing` hợp lý.
- `lib/sheets/client.ts`: `getAccessToken` nhận config. Có JSON → `new GoogleAuth({ credentials, scopes })`, không thì giữ `keyFile`.
- `lib/sheets/sync.ts:57` cập nhật theo chữ ký mới. Cập nhật `tests/sheets-sync.test.ts` nếu vỡ; thêm 1 case cho đường JSON.
- `.env.example`: thêm dòng comment cho `GOOGLE_SERVICE_ACCOUNT_JSON`.

### 3.6 README (gốc)
- Thêm mục ngắn "Đóng gói exe có cấu hình sẵn": copy `secrets/build-secrets.example.json` → `secrets/build-secrets.json`, điền key (dán nội dung file service account vào `GOOGLE_SERVICE_ACCOUNT_JSON`), chạy `npm run dist`. Nêu rõ giới hạn: chỉ phát hành cho máy tin cậy, key nhúng vẫn có thể bị trích xuất; muốn đổi key thì build lại hoặc ghi đè trong Settings.

## 4. Kiểm tra (agent tự chạy)
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` đều xanh.
- Round-trip với dữ liệu giả: tạo tạm `secrets/build-secrets.json` giá trị giả → `npm run build:secrets` → script nhỏ (không commit) `decrypt` file và so khớp → **xóa** `secrets/build-secrets.json` giả và `resources/secrets/secrets.enc`.
- Thiếu file → `npm run build:secrets` exit 0 kèm cảnh báo.
- `node scripts/prepare-electron-resources.mjs` (sau `npm run build`) → không còn `resources/app/.env*`.
- `git status` trước commit cuối: không có `secrets/build-secrets.json` hay `*.enc` trong danh sách.

## 5. Definition of Done
- [ ] 3.1: `.env*` bị xóa khỏi `resources/app`; `electron-builder.yml` loại `secrets*.json`, thêm extraResources `secrets.enc`; xóa `secrets.example.json` và comment cũ.
- [ ] 3.2: `secrets-crypto.js` + `encrypt-secrets.mjs` + example + `.gitignore` + `package.json` (`build:secrets`, `dist`).
- [ ] 3.3: `main.js` giải mã trong RAM, bơm env cho process con, không ghi đè biến hệ thống, lỗi thì fallback.
- [ ] 3.4: overlay env trong `getOrCreateSettings`, không ghi vào DB; PUT trả settings đã overlay; test mới xanh.
- [ ] 3.5: Sheets chạy được với `GOOGLE_SERVICE_ACCOUNT_JSON`; đường `FILE` cũ vẫn chạy.
- [ ] 3.6: README cập nhật, không vỡ encoding.
- [ ] Mục 4 xanh; không file nào ngoài phạm vi bị sửa; không secret thật trong diff hay log.
- [ ] Điền "Ghi chú của người thực thi" + liệt kê commit.

## Ghi chú của người thực thi
