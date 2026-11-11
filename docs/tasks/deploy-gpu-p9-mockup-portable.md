# Task P9: Mockup chạy được trên máy người dùng (đóng gói Python + template)

> **Dành cho agent thực thi.** Làm trên branch `feature/deploy_gpu` (worktree hiện tại, tip `8cda712`), nối tiếp P8. Gặp mâu thuẫn thì chọn phương án an toàn và ghi lý do vào "Ghi chú của người thực thi".

## 0. Quy tắc bắt buộc
1. Không commit hay in secret. **Không chạy `npm run dist`/electron-builder.** Không sửa `%APPDATA%\anima-studio`.
2. **Không sửa thuật toán `scripts/mockup/wrap_mockup.py`.** Chỉ được sửa phần nhận tham số hoặc thông báo lỗi nếu bắt buộc, và phải ghi lý do.
3. Comment code tối đa 1 dòng. Thông báo tiếng Việt, giữ UTF-8.
4. Commit theo thứ tự: (a) spec → (b) `.gitignore` → (c) template vào repo + prepare script → (d) bỏ hardcode + lỗi rõ ràng (run-mockup, upscale, auto-publish) → (e) `download-python.mjs` + builder + main.js → (f) test → (g) README → (h) ghi chú.

## 1. Lỗi (reviewer đã xác minh)
Trên máy người dùng, bước "2. Chuẩn bị file in & mockup" báo "Tạo mockup sản phẩm thất bại". Trên máy dev thì chạy được vì:
- `lib/mockup/run-mockup.ts:13` hardcode `DEFAULT_TEMPLATES_DIR = "D:\\model_gen_anh_local_18\\MVP_workflow\\mockup"`. Thư mục này chỉ có trên máy dev, chứa 5 file `Context Covers.png`, `Context Q1.png` … `Context Q4.png` (~700KB), và bị `.gitignore:76` (`/mockup/*`) loại khỏi repo. Fallback `process.cwd()/assets/mockup_templates` **không có trong bộ cài**.
- Mockup gọi `python scripts/mockup/wrap_mockup.py`, cần Python + numpy + Pillow (script có `import numpy`, `from PIL import ...`, `ImageFont.truetype("arial.ttf")` có fallback `load_default`). Máy dev có miniconda kèm Pillow 12.2.0 + numpy 2.4.6; máy người dùng thường không có Python.
- `lib/pipeline/auto-publish.ts:85-87` throw chung "Tạo mockup sản phẩm thất bại", nuốt mất lý do thật. `upscaleBatch` (`lib/generations/upscale-image.ts:302-353`) chỉ trả `mockup: status`, không trả error.
- Thêm: `.gitignore` **chưa loại `/resources/secrets/`** (chứa `secrets.enc` từ P6), nên có nguy cơ commit nhầm.

## 3. Thay đổi
### 3.1 `.gitignore`
- Thêm `/resources/secrets/` và `/resources/python/`, `/resources/python-download.zip` cạnh các dòng `/resources/...` hiện có.

### 3.2 Template vào repo
- Copy 5 file từ `D:\model_gen_anh_local_18\MVP_workflow\mockup\` (`Context Covers.png`, `Context Q1.png`, `Context Q2.png`, `Context Q3.png`, `Context Q4.png`) vào `assets/mockup_templates/` rồi commit. Kiểm tra `git check-ignore` không chặn. Nếu không đọc được ổ D: thì dừng và báo `failed`.
- `scripts/prepare-electron-resources.mjs`: copy `assets/mockup_templates` → `resources/app/assets/mockup_templates`. Thiếu thư mục nguồn thì throw lỗi rõ ràng.

### 3.3 Bỏ hardcode + lỗi rõ ràng
- `lib/mockup/run-mockup.ts`:
  - Xóa `DEFAULT_TEMPLATES_DIR`. Export `resolveTemplatesDir(env = process.env, cwd = process.cwd())` để test. Ứng viên theo thứ tự: `env.MOCKUP_TEMPLATES_DIR`, `path.join(cwd, "assets", "mockup_templates")`. Hợp lệ khi có `Context Covers.png`.
  - Không tìm thấy → `error` liệt kê các đường dẫn đã thử.
  - Lỗi spawn `code === "ENOENT"` → "Không tìm thấy Python để tạo mockup (MOCKUP_PYTHON=<giá trị>)". Lỗi khác → message + 300 ký tự cuối `stderr` (nếu có).
- `lib/generations/upscale-image.ts`: `UpscaleBatchResult` thêm `mockupError?: string`, lấy từ `mockupRes.error` hoặc `err.message`.
- `lib/pipeline/auto-publish.ts`: `throw new Error(\`Tạo mockup sản phẩm thất bại: ${upscaleResult.mockupError ?? "không rõ lý do"}\`)`.

### 3.4 Python embeddable
- File mới `scripts/download-python.mjs`, theo mẫu `scripts/download-node.mjs`:
  - Pin `PYTHON_VERSION = "3.11.9"`. Tải `https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip` → giải nén vào `resources/python/` (xóa bản cũ trước).
  - Sửa `resources/python/python311._pth`: thêm dòng `Lib\site-packages` và bỏ comment `import site`.
  - Cài wheel bằng Python hệ thống (`process.env.BUILD_PYTHON || "python"`): `-m pip install --target resources/python/Lib/site-packages --only-binary=:all: --platform win_amd64 --python-version 3.11 --implementation cp Pillow==<pin> numpy==<pin>`. Chọn pin mới nhất có wheel cp311 win_amd64 và tương thích script (gợi ý Pillow 11.x, numpy 2.2.x hoặc 2.3.x), ghi lý do vào Ghi chú.
  - Kiểm tra cuối: `resources/python/python.exe -c "import PIL, numpy; print(PIL.__version__, numpy.__version__)"`, exit khác 0 thì throw.
  - Agent **được chạy** script này 1 lần để kiểm chứng (cần mạng). `resources/python/` đã gitignore.
- `package.json`: `"build:python": "node scripts/download-python.mjs"`. **Không** thêm vào `dist`; chạy tay 1 lần như `build:node`.
- `electron-builder.yml` `extraResources`: `- from: resources/python` / `to: python`.
- `electron/main.js`:
  - `getPaths()` packaged thêm `pythonBinary: path.join(resourcesDir, "python", "python.exe")`; dev: `null`.
  - `startServer()` env: nếu `paths.pythonBinary` tồn tại thì `MOCKUP_PYTHON: paths.pythonBinary`. Đặt sau `...embeddedSecrets`, trước các biến hệ thống.

### 3.5 Test
- `tests/mockup-templates.test.ts`: `resolveTemplatesDir` dùng thư mục tạm có `Context Covers.png` → trả đúng; env ưu tiên hơn cwd; không có thì `null`.
- `tests/electron-packaging.test.ts` (đã có từ P8): thêm assert extraResources có `resources/python`; `prepare-electron-resources.mjs` có `mockup_templates`; `assets/mockup_templates/Context Covers.png` tồn tại trong repo.
- Test `auto-publish` hoặc `upscale` (theo pattern mock hiện có): khi mockup failed với error X thì message ném ra chứa X.

### 3.6 README
- Mục đóng gói: thêm bước `npm run build:python` (1 lần, cần mạng và Python hệ thống có pip) cạnh `build:node`. Ghi template mockup nằm ở `assets/mockup_templates/`.

## 4. Kiểm tra
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` xanh.
- `npm run build:python` chạy thành công; `resources/python/python.exe -c "import PIL, numpy"` OK.
- Chạy `resources/python/python.exe scripts/mockup/wrap_mockup.py --help` (hoặc tương đương) không lỗi import.
- `git status` sạch, **không** có file trong `resources/`.

## 5. Definition of Done
- [x] `.gitignore` loại `resources/secrets`, `resources/python`.
- [x] 5 template trong `assets/mockup_templates/`; prepare script copy vào `resources/app`.
- [x] Không còn đường dẫn `D:\` hardcode trong `lib/`; `resolveTemplatesDir` có test.
- [x] Lỗi mockup hiện lý do thật tới UI.
- [x] `build:python` hoạt động; builder ship `resources/python`; `main.js` đặt `MOCKUP_PYTHON`.
- [x] Mục 4 xanh; Ghi chú + danh sách commit + pin version Pillow/numpy.

## Ghi chú của người thực thi
1. **Phiên bản pin và lý do lựa chọn:**
   - `PYTHON_VERSION = "3.11.9"`: Bản Python embeddable chính thức win-amd64 từ python.org, tương thích hoàn toàn với Electron child process.
   - `PILLOW_VERSION = "11.3.0"`: Bản mới nhất thuộc nhánh Pillow 11.x có sẵn pre-built wheel `cp311-cp311-win_amd64`, tương thích hoàn hảo với các lệnh PIL trong `wrap_mockup.py`.
   - `NUMPY_VERSION = "2.3.5"`: Bản mới nhất thuộc nhánh numpy 2.3.x có sẵn pre-built wheel `cp311-cp311-win_amd64`, hỗ trợ đầy đủ các phép toán ma trận/homography của `wrap_mockup.py`.

2. **Kết quả kiểm tra (Mục 4):**
   - `npm test`: 34 test files pass, 219/219 tests pass (100%).
   - `npx tsc --noEmit`: Exit code 0, không có lỗi type.
   - `npm run lint`: Exit code 0, eslint sạch.
   - `npm run build`: Next.js 16.4.3 production build thành công (26/26 routes).
   - `npm run build:python`: Chạy thành công; embed python tải và cấu hình `python311._pth` chuẩn xác; pip cài đặt thành công wheel vào `Lib/site-packages`.
   - Kiểm tra import embed python: `resources/python/python.exe -c "import PIL, numpy; print(PIL.__version__, numpy.__version__)"` in ra `11.3.0 2.3.5`.
   - Kiểm tra mockup script: `resources/python/python.exe scripts/mockup/wrap_mockup.py --help` hiển thị trợ giúp bình thường không lỗi import.
   - `git status` sạch hoàn toàn, thư mục `resources/` đã được gitignore.

3. **Danh sách commit:**
   - `74ba1ee` docs: add task p9 mockup portable spec
   - `cb16030` build: ignore resources/secrets and resources/python in gitignore
   - `88fb682` feat(mockup): add templates to repo and package into electron resources
   - `ca632d2` fix(mockup): resolve template dir dynamically and propagate detailed mockup errors
   - `3ea1b0d` feat(electron): embed portable python runtime for mockup generation
   - `abde3ea` test: add tests for mockup templates, electron packaging, and error propagation
   - `73fb371` docs: document build:python step and mockup templates location
