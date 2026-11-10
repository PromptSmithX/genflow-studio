# Anima Studio

Ứng dụng local-first để tạo ảnh anime qua **ComfyUI** đang chạy trên GPU **RunPod Serverless** (model `One obsession_Anima v4.0`), dành cho một người dùng trên một máy Windows. Giao diện và logic chạy local (Next.js).

## 1. Yêu cầu

- Windows 10/11.
- [Node.js](https://nodejs.org/) bản LTS (≥ 20) và npm (đi kèm Node).
- Không cần cài Python trên máy local cho việc sinh ảnh — worker ComfyUI chạy trên RunPod Serverless.

## 2. Cài đặt lần đầu

```bash
npm install
npm run db:migrate
npm run db:seed
```

- `npm run db:migrate` tạo database SQLite tại `data/anima.sqlite` theo schema Prisma.
- `npm run db:seed` tạo dữ liệu mẫu **chỉ khi bảng đang trống**: prompt mặc định, 3 style mẫu (Anime Cinematic, Soft Illustration, Manga Art). Chạy lại không ghi đè dữ liệu bạn đã sửa.

Sao chép `.env.example` thành `.env` nếu bạn cần chỉnh `DATABASE_URL` hoặc cấu hình R2 / Google Sheets.

## 3. Chạy ứng dụng

```bash
npm run dev
```

Mở `http://127.0.0.1:3000`. Server chỉ bind vào `127.0.0.1` (loopback), không truy cập được từ máy khác trong mạng.

## 4. Nơi lưu dữ liệu

- `data/anima.sqlite` — toàn bộ prompt, style, settings, lịch sử job (không commit vào Git).
- `data/workflows/` — file workflow ComfyUI (API format) đã import.
- `data/outputs/` — ảnh đã tải về từ ComfyUI.

Muốn backup: sao chép cả thư mục `data/`. Muốn restore: dán thư mục `data/` vào bản cài mới rồi chạy `npm run dev` (không cần migrate lại).

## 5. Kết nối GPU RunPod Serverless

1. Build và triển khai worker ComfyUI Serverless theo hướng dẫn tại [deploy/runpod-serverless/README.md](deploy/runpod-serverless/README.md).
2. Vào **Cài đặt → Kết nối GPU** trong app, nhập **Endpoint ID** và **API key**, rồi bấm **Lưu kết nối** và **Kiểm tra kết nối**.
3. Vào **Cài đặt → Trợ lý AI**, nhập LLM API key để sử dụng tính năng gợi ý prompt tự động (mặc định xAI `https://api.x.ai/v1`, model `grok-4-fast-non-reasoning`).

## 6. Import workflow và cấu hình node mapping

1. Trong ComfyUI, mở workflow Anima của bạn, chọn **Save (API Format)** để xuất file JSON.
2. Vào **Cài đặt → Workflow ComfyUI**, import file JSON đó.
3. App sẽ hiện danh sách node (ID, class type, input hiện có). Ở phần **Node mapping**, với từng trường (Positive prompt, Negative prompt, Seed, Width, Height, Steps, CFG, Sampler, Scheduler, Batch size):
   - Bật/tắt trường đó.
   - Chọn node tương ứng.
   - Chọn input key tồn tại trong node đó.
4. Bấm **Lưu mapping**, sau đó bấm **Validate mapping**. Trang Tạo ảnh chỉ hoạt động khi mapping hợp lệ (Positive prompt luôn bắt buộc).

Không có node ID nào bị hard-code trong code — bạn phải tự map theo đúng workflow của mình.

## 7. Cấu hình Cloudflare R2 (Đẩy ảnh & Xuất CSV Printify)

Để sử dụng tính năng đẩy ảnh lên Cloudflare R2 và xuất file CSV Printify hàng loạt, cần cấu hình các biến môi trường trong file `.env`:
- `R2_ACCOUNT_ID`: Cloudflare Account ID.
- `R2_ACCESS_KEY_ID`: Access Key ID của R2 API Token.
- `R2_SECRET_ACCESS_KEY`: Secret Access Key của R2 API Token.
- `R2_BUCKET`: Tên bucket R2.
- `R2_PUBLIC_BASE_URL`: URL public CDN trỏ tới bucket (vd `https://pub-xxx.r2.dev` hoặc custom domain).
- `R2_KEY_PREFIX`: Tiền tố đường dẫn lưu trên R2 (mặc định `calendars/anima`).

## 8. Cấu hình Google Sheets (Đồng bộ bảng online tự động)

Để tự động đồng bộ kết quả lên Google Sheets:
1. Vào [Google Cloud Console](https://console.cloud.google.com/), tạo project và bật **Google Sheets API**.
2. Tạo **Service Account**, tạo và tải file JSON key về máy.
3. Tạo một Google Spreadsheet mới, chia sẻ (Share) quyền **Editor** cho email của Service Account vừa tạo.
4. Cấu hình biến môi trường trong file `.env`:
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: Chuỗi nội dung JSON của Service Account (ưu tiên), hoặc:
   - `GOOGLE_SERVICE_ACCOUNT_FILE`: Đường dẫn tuyệt đối hoặc tương đối tới file JSON key (vd `keys/google-service-account.json`).
   - `GOOGLE_SHEET_ID`: ID của bảng tính Google Sheets (lấy từ URL: `https://docs.google.com/spreadsheets/d/<GOOGLE_SHEET_ID>/edit`).

## 9. Đóng gói exe có cấu hình sẵn ("zero-config")

Để đóng gói bộ cài Windows (.exe) nhúng sẵn cấu hình (RunPod, LLM, R2, Google Sheets) giúp ứng dụng mở lên là dùng được ngay:

1. Sao chép file mẫu:
   ```bash
   cp secrets/build-secrets.example.json secrets/build-secrets.json
   ```
2. Điền các giá trị secret vào `secrets/build-secrets.json`:
   - `ANIMA_RUNPOD_ENDPOINT_ID`, `ANIMA_RUNPOD_API_KEY`: Thông tin worker RunPod Serverless.
   - `ANIMA_LLM_API_KEY`, `ANIMA_LLM_BASE_URL`, `ANIMA_LLM_MODEL`: Cấu hình Trợ lý AI.
   - `R2_*`: Cấu hình Cloudflare R2 bucket.
   - `GOOGLE_SHEET_ID`: ID Google Spreadsheet.
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: Dán toàn bộ object JSON từ file Google Service Account vào đây (hoặc dán dưới dạng chuỗi JSON).
3. Đóng gói bộ cài Electron:
   ```bash
   npm run dist
   ```
   Lệnh này tự động mã hóa secrets (`resources/secrets/secrets.enc`) qua AES-256-GCM trước khi đóng gói.

> **Lưu ý & Giới hạn bảo mật:**
> - Bản đóng gói nhúng key chỉ dành riêng để phát hành và cài đặt trên **máy tin cậy của chủ dự án**.
> - Dù key đã được mã hóa trong bộ cài, người dùng có chuyên môn kỹ thuật sâu vẫn có thể trích xuất được từ tiến trình ứng dụng.
> - Key nhúng luôn được ưu tiên và các ô tương ứng trong Settings bị khóa. Đổi key thì build lại rồi cài đè, không cần xóa dữ liệu.
> - Nâng cấp tự backup DB thành `%APPDATA%\anima-studio\anima.sqlite.bak-*` (giữ 3 bản). Migrate lỗi thì app báo và không mở. Khôi phục bằng cách đổi tên file backup thành `anima.sqlite`.

## 10. Xử lý lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| HTTP 502 khi kiểm tra kết nối | Endpoint chưa sẵn sàng hoặc thông tin Endpoint ID / API key chưa đúng | Kiểm tra Endpoint ID và API key trong Cài đặt hoặc kiểm tra log worker trên RunPod |
| Lỗi parse JSON khi import workflow | File không đúng định dạng API, hoặc không phải export từ "Save (API Format)" | Export lại đúng cách từ ComfyUI |
| Mapping không hợp lệ | Node ID/input key không còn tồn tại trong workflow mới | Vào Cài đặt, chọn lại node/input, Validate lại |
| GPU out of memory / lỗi node khi tạo ảnh | Workflow/model vượt quá VRAM của GPU worker | Giảm kích thước ảnh/steps, hoặc kiểm tra cấu hình worker |

## 11. Scripts

```bash
npm run dev         # chạy dev server (bind 127.0.0.1)
npm run build       # build production
npm run start        # chạy production build
npm run lint          # kiểm tra lint
npm run test           # chạy test (Vitest)
npm run db:migrate   # chạy Prisma migration
npm run db:seed       # seed dữ liệu mẫu (an toàn, không overwrite)
npm run db:studio     # mở Prisma Studio để xem database
```

## 12. Công nghệ sử dụng

Next.js (App Router) + TypeScript, Tailwind CSS + shadcn/ui, Prisma + SQLite, Zod, React Hook Form, TanStack Query, Vitest.
