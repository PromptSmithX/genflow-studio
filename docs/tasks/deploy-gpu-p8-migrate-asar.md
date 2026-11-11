# Task P8: Sửa migrate.js không chạy được trong exe (file nằm trong app.asar)

> **Dành cho agent thực thi.** Làm trên branch `feature/deploy_gpu` (worktree hiện tại), nối tiếp P7. Bản sửa nhỏ: chỉ sửa đúng các file ở mục 3. Gặp mâu thuẫn thì chọn phương án an toàn và ghi lý do vào "Ghi chú của người thực thi".

## 0. Quy tắc bắt buộc
1. Không commit hay in secret. Không chạy `npm run dist`/electron-builder. Không mở, sửa hay copy `%APPDATA%\anima-studio`.
2. Comment code tối đa 1 dòng. Thông báo tiếng Việt, giữ UTF-8.
3. Commit theo thứ tự: (a) spec này → (b) `electron-builder.yml` + `electron/main.js` → (c) test → (d) ghi chú.

## 1. Lỗi (reviewer đã tái hiện)
- Bản exe build từ P7 mở lên hiện hộp thoại "Anima Studio — Lỗi cập nhật dữ liệu", không có dòng backup.
- `getPaths()` nhánh packaged đặt `migrateScript = path.join(__dirname, "migrate.js")`, tức `resources\app.asar\electron\migrate.js`. `ensureUserData` chạy file này bằng `resources\node\node.exe` (Node 22.14 portable). Node thường **không đọc được file trong asar**:
  ```
  Error: Cannot find module '...\resources\app.asar\electron\migrate.js'  code: 'MODULE_NOT_FOUND'
  ```
- Lỗi có từ trước P7 nhưng bị nuốt, nên migration trong exe **chưa bao giờ chạy**. P7 làm nó lộ ra.
- `migrate.js` chỉ dùng builtin `node:*`. Reviewer đã chạy nó (bằng node portable) trên một bản copy DB thật: áp 6 migration OK, số dòng giữ nguyên, integrity ok. Vậy chỉ cần sửa chỗ đặt file. **Không sửa `migrate.js`.**

## 3. Thay đổi
1. `electron-builder.yml`: thêm khóa cấp gốc
   ```yaml
   asarUnpack:
     - electron/migrate.js
   ```
2. `electron/main.js` `getPaths()` nhánh `app.isPackaged`: `migrateScript: path.join(resourcesDir, "app.asar.unpacked", "electron", "migrate.js")`. Nhánh dev giữ nguyên.
3. `electron/main.js` `ensureUserData`: hiện nhánh `else if (fs.existsSync(paths.migrationsDir) && fs.existsSync(paths.migrateScript))` **âm thầm bỏ qua** migrate khi thiếu file, và đó là cách lỗi bị giấu. Đổi thành: DB đã tồn tại thì luôn kiểm tra; thiếu `migrateScript` hoặc `migrationsDir` → throw `MigrationError` (cùng cấu trúc hiện có: `name`, `dataRoot`, `backupPath = null`) với message tiếng Việt nêu đường dẫn file hoặc thư mục bị thiếu.
4. `electron/main.js`:
   - `spawnSync` đổi `stdio` thành `["ignore", "pipe", "pipe"]`; ghi lại `result.stderr` ra `process.stderr`.
   - Khi lỗi, gắn `err.details` = 300 ký tự cuối của `stderr` (trim).
   - Hộp thoại `MigrationError` thêm một dòng cuối `Chi tiết: <error.message> — <error.details>` (bỏ phần trống) để ảnh chụp hộp thoại đủ thông tin chẩn đoán.
5. Test mới `tests/electron-packaging.test.ts`, chặn tái phát:
   - Đọc `electron-builder.yml` (parse text hoặc dùng thư viện yaml nếu đã có trong deps, **không thêm dependency mới**), khẳng định `asarUnpack` chứa `electron/migrate.js`.
   - Đọc `electron/main.js`, khẳng định có `"app.asar.unpacked"` và `"migrate.js"` trong nhánh packaged (kiểm chuỗi là đủ).
   - Khẳng định `electron/migrate.js` không `require` module ngoài `node:*`, bằng regex trên các lời gọi `require("...")`.

## 4. Kiểm tra
- `npm test`, `npx tsc --noEmit`, `npm run lint` đều xanh.
- `git status` sạch trước commit cuối.

## 5. Definition of Done
- [x] `asarUnpack` có `electron/migrate.js`; `main.js` packaged trỏ tới `app.asar.unpacked`.
- [x] Thiếu script hoặc thư mục migration → `MigrationError` rõ ràng, không còn bỏ qua âm thầm.
- [x] Hộp thoại lỗi có dòng "Chi tiết" (message + đuôi stderr).
- [x] `tests/electron-packaging.test.ts` xanh; toàn bộ mục 4 xanh.
- [x] Không sửa `electron/migrate.js` hay file ngoài phạm vi.
- [x] Điền "Ghi chú của người thực thi" + liệt kê commit.

## Ghi chú của người thực thi
- Thực hiện sửa lỗi theo đúng spec:
  - `electron-builder.yml`: Cấu hình cấp gốc `asarUnpack: [electron/migrate.js]` để giải nén file migrate.js ra ngoài file lưu trữ asar.
  - `electron/main.js`:
    - Nhánh `app.isPackaged`: đặt `migrateScript` trỏ tới `path.join(resourcesDir, "app.asar.unpacked", "electron", "migrate.js")`.
    - `ensureUserData`: DB đã tồn tại thì kiểm tra bắt buộc sự tồn tại của `migrateScript` và `migrationsDir`. Nếu thiếu thì throw `MigrationError` tiếng Việt kèm đường dẫn file/thư mục thiếu thay vì âm thầm bỏ qua.
    - `spawnSync` chuyển `stdio` sang `["ignore", "pipe", "pipe"]`, ghi stderr ra `process.stderr`, gắn `err.details` = 300 ký tự cuối của stderr khi có lỗi.
    - Hộp thoại `dialog.showErrorBox` bổ sung dòng `Chi tiết: <error.message> — <error.details>` khi lỗi.
  - `tests/electron-packaging.test.ts`: Bộ kiểm thử mới gồm 3 test case kiểm tra `asarUnpack`, đường dẫn `app.asar.unpacked` trong `main.js`, và xác nhận `migrate.js` chỉ require built-in modules dạng `node:*`.
- Kết quả kiểm tra:
  - `npm test`: 33/33 test files pass, 212/212 unit tests pass 100%.
  - `npx tsc --noEmit`: 0 lỗi type.
  - `npm run lint`: 0 lỗi ESLint.
  - Tuyệt đối không chỉnh sửa `electron/migrate.js` hay các file ngoài phạm vi.
- Danh sách commit theo thứ tự (a)-(d):
  - (a) `4bdc6cb`: docs: add task p8 migrate asar unpack spec
  - (b) `1925721`: fix(electron): unpack migrate.js from asar and fail explicitly when migration files missing
  - (c) `8dbf3ca`: test(electron): assert asarUnpack and unpacked migrateScript in packaging
  - (d) `docs: update task p8 execution notes and definition of done` (commit hiện tại)
