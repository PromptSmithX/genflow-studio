# Task P7: Key nhúng luôn thắng + gia cố migration khi nâng cấp exe

> **Dành cho agent thực thi.** Làm trên branch `feature/deploy_gpu` (worktree hiện tại, tip `b34e6ca`), nối tiếp P6 (`docs/tasks/deploy-gpu-p6-package-exe.md`, đọc lại phần thiết kế trước khi code). Gặp mâu thuẫn thì chọn phương án an toàn và ghi lý do vào "Ghi chú của người thực thi".

## 0. Quy tắc bắt buộc
1. Không commit hay in secret. Test chỉ dùng giá trị giả.
2. Đọc `AGENTS.md` và `node_modules/next/dist/docs/` liên quan trước khi sửa API route hoặc component.
3. Chỉ sửa các file ở mục 3. Không đụng `deploy/runpod-serverless/`. Comment code tối đa 1 dòng. UI/thông báo tiếng Việt, giữ UTF-8.
4. Commit nhỏ theo thứ tự: (a) spec này → (b) settings env-wins + managedFields + test (3.1–3.2) → (c) UI khóa ô (3.3) → (d) migrate backup + test (3.4) → (e) main.js dialog (3.5) → (f) README → (g) ghi chú.
5. **Không chạy `npm run dist`/electron-builder.** Không mở hay sửa `%APPDATA%\anima-studio` thật.

## 1. Lý do
- P6 dùng quy tắc "DB thắng env": máy đã từng nhập key tay ở Settings thì key cũ trong DB sẽ che key nhúng. Khi chủ dự án đổi key rồi build lại, máy đó không nhận key mới, mà không thể bắt người dùng tự xóa dữ liệu. **Quyết định mới: key nhúng (env) luôn thắng, Settings khóa các ô đó.**
- Máy đã cài bản cũ (ví dụ DB ở migration 03/11, thiếu 4 migration) được `electron/migrate.js` tự nâng cấp lúc mở app. Nhưng:
  - Không có backup tự động trước khi migrate.
  - `electron/main.js` (`ensureUserData`, khoảng dòng 108-121) thấy migrate lỗi chỉ `console.error` rồi **vẫn mở app** với schema hỏng.
  - Thư mục userData thật đang có file `anima.sqlite.backup-before-migration-fix`, `.bak-before-fix`, tức là đã từng gặp lỗi migrate.
  - `createWindow().catch` chỉ log rồi `app.quit()`, nên người dùng thấy app tắt im lặng.

## 3. Thay đổi

### 3.1 Env luôn thắng — `lib/settings.ts`
- `applyEnvDefaults(row, env)`: với 5 field `runpodEndpointId←ANIMA_RUNPOD_ENDPOINT_ID`, `runpodApiKey←ANIMA_RUNPOD_API_KEY`, `llmApiKey←ANIMA_LLM_API_KEY`, `llmBaseUrl←ANIMA_LLM_BASE_URL`, `llmModel←ANIMA_LLM_MODEL`: env khác rỗng sau trim → dùng env (trim), **bất kể DB**. Env rỗng → giữ giá trị DB. Không ghi DB. (Có thể đổi tên thành `applyManagedSettings`; nếu đổi thì cập nhật mọi chỗ gọi.)
- Thêm `export function getManagedFields(env = process.env): ManagedField[]`, trả tên field (theo tên cột Prisma) có env khác rỗng. Đặt mapping field↔env ở **một** hằng dùng chung cho cả hai hàm.
- `redactSettings(settings)` thêm `managedFields: getManagedFields()`. Không thêm giá trị key nào.
- `lib/types.ts` `SettingsDTO`: thêm `managedFields: string[]` (hoặc union type).

### 3.2 Chặn ghi đè — `app/api/settings/route.ts` (PUT)
- Thêm hàm thuần `omitManagedFields(body, managed)` (đặt trong `lib/settings.ts` để test dễ): trả bản copy body đã bỏ các key thuộc `managed`. PUT gọi hàm này ngay sau `settingsUpdateSchema.parse`, nên field managed không bao giờ ghi vào DB, kể cả `null` (xóa).
- Field khác (`llmSystemPrompt`, `defaultWidth`, …) vẫn sửa bình thường. PUT vẫn trả `redactSettings(await getOrCreateSettings())`.

### 3.3 UI khóa ô
- `components/settings/connection-card.tsx`: field có trong `settings.managedFields` → `Input disabled`, placeholder "Đã cấu hình sẵn trong bản cài". Nếu cả `runpodEndpointId` và `runpodApiKey` đều managed thì ẩn nút Lưu và nút xóa/ngắt kết nối, hiện 1 dòng chú thích nhỏ "Kết nối GPU đã được cấu hình sẵn trong bản cài." **Giữ nút "Test kết nối"**, và nút này phải bật được khi đang managed (sửa điều kiện `isConfiguredOrHasInput` nếu cần).
- `components/settings/llm-card.tsx`: tương tự cho `llmApiKey`, `llmBaseUrl`, `llmModel`. Ẩn nút xóa key khi `llmApiKey` managed. `llmSystemPrompt` vẫn sửa được, và nút Lưu vẫn hiện nếu còn field sửa được.
- Không gửi field managed trong payload lưu. Dù vậy server vẫn phải chặn (3.2).
- `components/app-shell/connect-onboarding.tsx`: xác nhận nó tự ẩn khi `runpodEndpointId` + `hasRunpodKey` đã có (nhờ overlay). Chỉ sửa nếu cần và ghi lý do.

### 3.4 Backup trước khi migrate — `electron/migrate.js`
- Tính danh sách pending (thư mục migration chưa có trong `_prisma_migrations` và có `migration.sql`) **trước** khi áp.
- Không có pending → không backup, giữ log hiện tại, exit 0.
- Có ít nhất 1 pending → `db.exec("VACUUM INTO '<backupPath>'")`, với `backupPath = <dbPath>.bak-<YYYYMMDD-HHmmss>` (giờ local; escape `'` thành `''`). In ra stdout đúng 1 dòng `BACKUP_PATH=<backupPath>`.
  - Xoay vòng: chỉ giữ 3 file mới nhất khớp regex `^<basename(db)>\.bak-\d{8}-\d{6}$` trong cùng thư mục. **Không** đụng file khác như `.backup-before-migration-fix`, `.bak-before-fix`.
  - Backup lỗi → exit 1 (không migrate khi chưa backup được).
- Giữ nguyên logic áp migration và nhánh `duplicate column/already exists` hiện tại.

### 3.5 Báo lỗi rõ ràng — `electron/main.js`
- `ensureUserData`: `spawnSync(..., { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", windowsHide: true })`; ghi lại stdout ra `process.stdout`; parse dòng `BACKUP_PATH=`.
  - `result.error` hoặc `result.status !== 0` → `throw` lỗi có `name = "MigrationError"`, kèm `backupPath` (nếu có) và `dataRoot`. **Không** khởi động server.
- `createWindow().catch(error)`: `dialog.showErrorBox(...)` rồi `app.quit()`.
  - `MigrationError` → tiêu đề "Anima Studio — Lỗi cập nhật dữ liệu", nội dung tiếng Việt: dữ liệu chưa bị mất, file backup (đường dẫn nếu có), thư mục dữ liệu, gửi file log hoặc liên hệ người quản lý.
  - Lỗi khác → tiêu đề "Anima Studio — Không khởi động được", kèm `error.message`.
- `require("electron")` thêm `dialog`.

### 3.6 README (gốc)
- Trong mục "Đóng gói exe có cấu hình sẵn" (P6) thêm 2 ý:
  - Key nhúng luôn được ưu tiên và các ô tương ứng trong Settings bị khóa. Đổi key thì build lại rồi cài đè, không cần xóa dữ liệu.
  - Nâng cấp tự backup DB thành `%APPDATA%\anima-studio\anima.sqlite.bak-*` (giữ 3 bản). Migrate lỗi thì app báo và không mở. Khôi phục bằng cách đổi tên file backup thành `anima.sqlite`.

## 4. Test và kiểm tra
- `tests/settings-env-defaults.test.ts`:
  - Đổi case "DB thắng" thành "env thắng DB".
  - Env rỗng hoặc chỉ khoảng trắng → giữ DB.
  - `getManagedFields` đúng danh sách.
  - `redactSettings` có `managedFields`, và `JSON.stringify` không chứa key giả.
  - `omitManagedFields` bỏ đúng field managed, kể cả giá trị `null`.
- Test mới `tests/electron-migrate.test.ts`: dùng `node:sqlite` + thư mục tạm `fs.mkdtempSync(os.tmpdir())`, chạy `node electron/migrate.js <db> <dir>` bằng `spawnSync(process.execPath, …)`. Nếu `node:sqlite` không có trong môi trường test thì `describe.skip` kèm lý do, ghi vào Ghi chú.
  1. DB có `_prisma_migrations` với 1 migration đã áp + thư mục có thêm 1 migration mới hợp lệ → exit 0, có đúng 1 file `.bak-*`, stdout có `BACKUP_PATH=`, migration mới được ghi nhận, bảng hoặc cột mới tồn tại.
  2. Không pending → exit 0, không tạo backup.
  3. Migration SQL sai cú pháp → exit 1, backup vẫn được tạo trước đó.
  4. Tạo sẵn 4 file `.bak-<timestamp>` giả + 1 file `.backup-before-migration-fix` → sau 1 lần migrate còn đúng 3 file `.bak-*` mới nhất, file `.backup-before-migration-fix` vẫn còn.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` đều xanh.
- `git status` trước commit cuối: không có file DB tạm, `secrets/build-secrets.json` hay `*.enc`.

## 5. Definition of Done
- [x] 3.1: env luôn thắng DB; `getManagedFields`; `redactSettings.managedFields`; `SettingsDTO` cập nhật.
- [x] 3.2: PUT không ghi field managed (kể cả `null`); `omitManagedFields` có test.
- [x] 3.3: ô managed bị khóa với nhãn tiếng Việt; "Test kết nối" vẫn dùng được; `llmSystemPrompt` vẫn sửa được.
- [x] 3.4: backup `VACUUM INTO` chỉ khi có pending; giữ 3 bản; không đụng backup thủ công; backup lỗi thì không migrate.
- [x] 3.5: migrate lỗi → hộp thoại tiếng Việt + thoát, không khởi động server; lỗi khởi động khác cũng hiện hộp thoại.
- [x] 3.6: README cập nhật, không vỡ encoding.
- [x] Mục 4 xanh; không file ngoài phạm vi bị sửa; không secret trong diff hay log.
- [x] Điền "Ghi chú của người thực thi" + liệt kê commit.

## Ghi chú của người thực thi
- Thực hiện đầy đủ các mục kỹ thuật theo spec:
  - 3.1: `lib/settings.ts` dùng hằng `MANAGED_FIELD_ENV_MAP` cho 5 trường nhúng; quy tắc env thắng DB khi env khác rỗng; thêm `getManagedFields()` và bổ sung `managedFields` vào `redactSettings` cùng `SettingsDTO` trong `lib/types.ts`.
  - 3.2: `omitManagedFields()` loại bỏ các trường managed trước khi cập nhật DB trong API PUT `/api/settings`.
  - 3.3: Khóa ô trong `components/settings/connection-card.tsx` và `components/settings/llm-card.tsx` với placeholder "Đã cấu hình sẵn trong bản cài". Nút test kết nối bật khi cấu hình managed. Nút lưu và xóa GPU ẩn khi cả 2 trường đều managed. `ConnectOnboarding` tự ẩn do `useHeaderConnectionState()` phát hiện cấu hình từ env.
  - 3.4: `electron/migrate.js` lọc danh sách pending migrations trước khi áp; thực hiện `VACUUM INTO` sao lưu DB khi có pending migration; in `BACKUP_PATH=...`; xoay vòng lưu tối đa 3 file backup mới nhất theo regex `^<basename>\.bak-\d{8}-\d{6}$`; giữ nguyên các file backup cũ thủ công.
  - 3.5: `electron/main.js` dùng `stdio: ["ignore", "pipe", "inherit"]`, parse dòng `BACKUP_PATH=`, throw `MigrationError` khi migrate thất bại và chặn khởi động server; hiển thị `dialog.showErrorBox()` tiếng Việt khi lỗi migrate hoặc lỗi khởi động.
  - 3.6: Cập nhật `README.md` về cơ chế ưu tiên key nhúng và tự động backup khi nâng cấp.
- Môi trường & kết quả kiểm tra:
  - Node.js runtime hỗ trợ `node:sqlite` (`DatabaseSync`), 4/4 test case trong `tests/electron-migrate.test.ts` pass 100%.
  - `npm test`: 32/32 test files pass, 208/208 tests pass.
  - `npx tsc --noEmit`: pass không lỗi.
  - `npm run lint`: pass không lỗi.
  - `npm run build`: Next.js 16.4.3 production build thành công.
- Danh sách commit theo thứ tự (a)-(g):
  - (a) `7329414`: docs: add task p7 managed keys and migration spec
  - (b) `b3da4c0`: feat(settings): prioritize environment settings and omit managed fields from updates
  - (c) `86bb715`: feat(ui): disable managed fields and hide modification controls when configured
  - (d) `4046e14`: feat(electron): backup database before migration and rotate backups
  - (e) `e6e1056`: feat(electron): show informative dialog on migration failure and prevent startup
  - (f) `ffba45c`: docs: document managed settings priority and automatic backup on upgrade
  - (g) `docs: update task p7 execution notes and definition of done` (commit hiện tại)
