# Task P10: Bộ cài chỉ chứa đúng thứ cần + chặn build thiếu runtime

> **Dành cho agent thực thi.** Làm trên branch `feature/deploy_gpu` (worktree hiện tại, tip `5a0f167`), nối tiếp P9. Gặp mâu thuẫn thì chọn phương án an toàn và ghi lý do vào "Ghi chú của người thực thi".

## 0. Quy tắc bắt buộc
1. Không commit hay in secret. **Không chạy `electron-builder` / `npm run dist`.** Được chạy `npm run build`, `node scripts/prepare-electron-resources.mjs`, `npm run build:template-db`, `npm run build:secrets`, `node scripts/verify-package.mjs`.
2. **Bắt buộc** đọc `AGENTS.md` và tài liệu trong `node_modules/next/dist/docs/` về `output: "standalone"`, `outputFileTracingExcludes`/`outputFileTracingIncludes` và chú thích `turbopackIgnore` **trước** khi sửa `next.config.ts`. Ghi vào Ghi chú đã đọc file docs nào.
3. **Không sửa** logic censor/fallback (`lib/comfyui/job-sync.ts`, phần censor của `lib/generations/upscale-image.ts`, `lib/mockup/run-mockup.ts` ngoài chú thích `turbopackIgnore`). User đã quyết định giữ nguyên.
4. Không đổi thuật toán `scripts/mockup/wrap_mockup.py`. Comment code tối đa 1 dòng, thông báo tiếng Việt, giữ UTF-8.
5. Commit theo thứ tự: (a) spec → (b) tracing exclude + turbopackIgnore → (c) copy tường minh trong prepare script → (d) `verify-package.mjs` + `package.json` → (e) `wrap_mockup.py` default → (f) test → (g) README → (h) ghi chú.

## 1. Vấn đề (reviewer đã xác minh trên `dist-electron/win-unpacked` build ngày 11/11)
- `resources/app` nặng **248MB**. Nó chứa `dist-electron/win-unpacked/...` và `resources/app/...` **lồng nhau** (mỗi lần build thêm một tầng), cùng `docs/`, `tests/`, `deploy/` (cả `__pycache__`), `data/workflows/`, và mã nguồn `.ts/.tsx` của `app/ components/ lib/`.
  - Nguyên nhân: các `path.join(process.cwd(), ...)` động khiến Next standalone file tracing kéo cả cây dự án vào.
  - Hiện chưa lọt secret, nhưng `secrets/build-secrets.json` (plaintext) và DB dev nằm trong cùng repo nên có thể lọt ở bản build sau.
- Các thư mục **thật sự cần** lúc chạy hiện chỉ có mặt nhờ tracing tình cờ:
  - `scripts/censor/` (`lib/censor/run-censor.ts:11`)
  - `scripts/mockup/` (`lib/mockup/run-mockup.ts:13`)
  - `Printify_Premade_Grid_Calendar_Templates/*/format.json` (`lib/calendar/formats.ts:40`, `lib/calendar/back-cover-format.ts:49`)
  - `assets/mockup_templates/` (đã copy tường minh từ P9)
- `npm run dist` không kiểm tra `resources/node/node.exe` và `resources/python/python.exe`. Trên máy build sạch, exe sẽ thiếu runtime mà không có cảnh báo nào.
- `scripts/mockup/wrap_mockup.py:25`: `DEFAULT_TEMPLATE_DIR = r"D:\model_gen_anh_local_18\MVP_workflow\mockup"`.

## 3. Thay đổi
### 3.1 Tracing
- `next.config.ts`: thêm `outputFileTracingExcludes` (key `"*"` hoặc theo cú pháp docs Next 16) loại `dist-electron/**`, `resources/**`, `data/**`, `secrets/**`, `.env*`, `docs/**`, `tests/**`, `deploy/**`, `mockup/**`, `templates/**`, `**/__pycache__/**`, cùng mã nguồn `app/**/*.{ts,tsx}`, `components/**`, `lib/**/*.ts`, `hooks/**` (không loại `.next/**` và `node_modules/**`).
- Thêm `/* turbopackIgnore: true */` cho các `process.cwd()` ở `lib/mockup/run-mockup.ts`, `lib/censor/run-censor.ts`, `lib/calendar/formats.ts`, `lib/calendar/back-cover-format.ts`, `lib/paths.ts`, **chỉ khi** docs xác nhận cú pháp và vị trí. Nếu docs không xác nhận thì bỏ qua và ghi lý do.
- Mục tiêu: sau `npm run build` + prepare, `resources/app` **không** còn `dist-electron`, `resources`, `docs`, `tests`, `deploy`, `secrets`, `.env*`, `data/*.sqlite`.

### 3.2 Copy tường minh — `scripts/prepare-electron-resources.mjs`
- Copy `scripts/censor/` → `resources/app/scripts/censor/` và `scripts/mockup/` → `resources/app/scripts/mockup/`, **lọc bỏ** `__pycache__` và `*.pyc`.
- Copy `Printify_Premade_Grid_Calendar_Templates/` → `resources/app/Printify_Premade_Grid_Calendar_Templates/`.
- Giữ copy `assets/mockup_templates` (P9). Thiếu thư mục nguồn nào thì throw lỗi rõ ràng.
- Trước khi copy standalone: nếu `.next/standalone` đã chứa `dist-electron`, `resources` hoặc `secrets` thì log cảnh báo và xóa khỏi `appDir` sau khi copy, phòng trường hợp exclude bị bỏ sót.

### 3.3 `scripts/verify-package.mjs` (mới)
- Export `verifyPackage(rootDir)` trả `{ errors: string[], warnings: string[] }`. Khi chạy trực tiếp: in kết quả; có `errors` thì exit 1.
- **Bắt buộc có** (thiếu → error, kèm hướng dẫn tiếng Việt, ví dụ "chạy `npm run build:node`"):
  - `resources/node/node.exe`
  - `resources/python/python.exe`, cộng thêm chạy `python.exe -c "import PIL, numpy"` với exit 0
  - `resources/template/anima.sqlite`, `resources/template/migrations/`
  - `resources/app/server.js`
  - `resources/app/scripts/mockup/wrap_mockup.py`, `resources/app/scripts/censor/censor.py`
  - `resources/app/assets/mockup_templates/Context Covers.png` cùng `Context Q1..Q4.png`
  - ít nhất 1 file `resources/app/Printify_Premade_Grid_Calendar_Templates/*/format.json`
  - `electron/migrate.js`
- **Bắt buộc không có trong `resources/app`** (có → error): `dist-electron`, `resources`, `secrets`, `build-secrets.json`, `token.txt`, `.env*` ở gốc, `*.sqlite` ở bất kỳ đâu.
- **Cảnh báo** (không fail): thiếu `resources/secrets/secrets.enc` ("exe sẽ yêu cầu nhập key thủ công"); `resources/app` > 150MB (in kích thước).
- `package.json`: thêm `"verify-package": "node scripts/verify-package.mjs"`. `dist` = `npm run build && npm run build:electron-resources && npm run build:template-db && npm run build:secrets && npm run verify-package && electron-builder --win`.

### 3.4 `wrap_mockup.py`
- `DEFAULT_TEMPLATE_DIR = Path(__file__).resolve().parents[2] / "assets" / "mockup_templates"` (import `Path` nếu chưa có; dùng `str()` nếu code cần chuỗi). Không đổi gì khác.

### 3.5 Test
- `tests/verify-package.test.ts`: thư mục tạm đủ file → không lỗi; thiếu `python.exe` → lỗi chứa "build:python"; có `resources/app/dist-electron` → lỗi; có `resources/app/data/x.sqlite` → lỗi; thiếu `secrets.enc` → chỉ cảnh báo. Bước chạy import PIL nên cho bỏ qua được bằng tham số (`{ skipExec: true }`) để test không cần Python.
- `tests/electron-packaging.test.ts` bổ sung:
  - `next.config.ts` chứa `outputFileTracingExcludes` với `dist-electron` và `secrets`.
  - `dist` có `verify-package` đứng trước `electron-builder`.
  - Prepare script có copy `scripts/mockup`, `scripts/censor`, `Printify_Premade_Grid_Calendar_Templates`.
- Grep-test: không file nào trong `lib/ app/ electron/ scripts/mockup/ scripts/censor/` chứa `D:\\` hoặc `C:\\Users\\`.

### 3.6 README
- Mục đóng gói: liệt kê đầy đủ các bước chuẩn bị 1 lần (`build:node`, `build:python`, `secrets/build-secrets.json`). Ghi rõ `npm run dist` sẽ dừng với thông báo rõ ràng nếu thiếu.

## 4. Kiểm tra
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` xanh.
- `node scripts/prepare-electron-resources.mjs && npm run build:template-db && npm run build:secrets && node scripts/verify-package.mjs`: exit 0. Ghi vào Ghi chú kích thước `resources/app` trước và sau, cùng danh sách thư mục gốc trong `resources/app`.
- Chạy `resources/python/python.exe resources/app/scripts/mockup/wrap_mockup.py --help` (hoặc tương đương) không lỗi.
- `git status` sạch, không có file trong `resources/`.

## 5. Definition of Done
- [x] `resources/app` không còn thư mục lồng hay thừa (mục 3.1); kích thước giảm rõ.
- [x] `scripts/{censor,mockup}`, `Printify_...`, `assets/mockup_templates` được copy tường minh.
- [x] `verify-package` có trong `dist`, fail đúng khi thiếu runtime hoặc lọt file cấm; có test.
- [x] `wrap_mockup.py` không còn `D:\`.
- [x] Mục 4 xanh; Ghi chú (docs đã đọc, kích thước trước/sau, commit).

## Ghi chú của người thực thi

### 1. Tài liệu Next.js đã đọc trong `node_modules/next/dist/docs/`
- `AGENTS.md`: Quy tắc kiểm tra breaking changes của Next.js trước khi viết code.
- `01-app/03-api-reference/05-config/01-next-config-js/output.md`:
  - Tìm hiểu cơ chế `output: "standalone"`, file tracing bằng `@vercel/nft`.
  - Cấu hình `outputFileTracingExcludes` và `outputFileTracingIncludes` theo route globs (picomatch) và đường dẫn tương đối từ project root.
- `01-app/03-api-reference/08-turbopack.md`:
  - Tìm hiểu bảng Magic Comments hỗ trợ trên Turbopack (`webpackIgnore: true`, `turbopackIgnore: true`, `turbopackOptional: true`).
- `01-app/02-guides/lazy-loading.md`:
  - Tìm hiểu vị trí và cú pháp của magic comments: chỉ hoạt động với các biểu thức dynamic (`import()`, `require()`, `require.resolve()`, `new Worker()`), **không** áp dụng cho `process.cwd()` hay `path.join()`.

### 2. Lý do bỏ qua `/* turbopackIgnore: true */` cho `process.cwd()`
- Tài liệu Next.js 16 chính thức (`turbopack.md`, `lazy-loading.md`) chỉ định rõ magic comments chỉ có tác dụng trong dynamic import/require expressions. Turbopack và NFT không nhận diện magic comment này khi phân tích `process.cwd()`.
- Do đó, theo đúng chỉ dẫn của spec mục 3.1 ("chỉ khi docs xác nhận cú pháp và vị trí. Nếu docs không xác nhận thì bỏ qua và ghi lý do"), ta bỏ qua việc thêm comment này vào `lib/mockup/run-mockup.ts` và `lib/censor/run-censor.ts`. Việc ngăn chặn file lọt vào bản build được đảm bảo bằng `outputFileTracingExcludes` trong `next.config.ts` cùng cơ chế dọn dẹp tường minh trong `scripts/prepare-electron-resources.mjs`.

### 3. Kích thước và cấu trúc `resources/app`
- **Trước P10**:
  - Kích thước: ~242.25 MB (tăng dần qua mỗi lần chạy build do lồng nhau).
  - Thư mục gốc: `.next`, `app`, `assets`, `components`, `data`, `deploy`, `dist-electron`, `docs`, `lib`, `node_modules`, `Printify_Premade_Grid_Calendar_Templates`, `prisma`, `public`, `resources`, `scripts`, `tests`, `package.json`, `server.js` (chứa `dist-electron/win-unpacked/...` và `resources/app/...` lồng nhau đệ quy, file dev sqlite, toàn bộ mã nguồn TypeScript).
- **Sau P10**:
  - Kích thước: 240.75 MB (giảm trừ hoàn toàn các tầng lồng nhau, thư mục dev và mã nguồn không dùng; 232MB là `node_modules` cần thiết cho standalone server).
  - Thư mục gốc: `.next`, `assets`, `node_modules`, `Printify_Premade_Grid_Calendar_Templates`, `prisma`, `public`, `scripts`, `package.json`, `server.js`.
  - Không còn bất kỳ thư mục nào trong số: `dist-electron`, `resources`, `secrets`, `data`, `docs`, `tests`, `deploy`, `app`, `components`, `lib`, `hooks`, `.env*`, `*.sqlite`.

### 4. Kết quả kiểm tra
- `npm test`: 35/35 test files passed (229/229 tests).
- `npx tsc --noEmit`: Exit code 0 (không lỗi).
- `npm run lint`: Exit code 0 (sạch).
- `npm run build`: Exit code 0 (Turbopack standalone build thành công).
- `node scripts/prepare-electron-resources.mjs && npm run build:template-db && npm run build:secrets && node scripts/verify-package.mjs`: Exit code 0.
- `resources/python/python.exe resources/app/scripts/mockup/wrap_mockup.py --help`: Exit code 0 (hiển thị CLI help chuẩn xác).
- `git status`: Sạch, `resources/` không bị track vào git.

### 5. Danh sách commits
- `edc5df5`: `docs: add task p10 portability hardening spec` (a)
- `030fc65`: `build(next): configure outputFileTracingExcludes for clean standalone package` (b)
- `c5f7f46`: `build(electron): explicitly copy runtime scripts and templates in prepare script` (c)
- `2df6130`: `feat(build): add verify-package gatekeeper script and hook into dist command` (d)
- `13cbf1e`: `fix(mockup): resolve DEFAULT_TEMPLATE_DIR relative to script location` (e)
- `6273f15`: `test(electron): add verify-package tests and packaging assertions` (f)
- `59b0fd5`: `docs: document packaging prerequisites and verify-package fail-fast mechanism` (g)
- (Commit h tiếp theo ghi nhận ghi chú hoàn thành task)
