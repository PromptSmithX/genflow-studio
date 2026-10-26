# Anima Studio

Ứng dụng local-first để tạo ảnh anime qua **ComfyUI** đang chạy trên GPU **Google Colab** (model `One obsession_Anima v4.0`), dành cho một người dùng trên một máy Windows. Giao diện và logic chạy local (Next.js); ComfyUI chỉ chạy ở Colab, kết nối qua URL tunnel.

## 1. Yêu cầu

- Windows 10/11.
- [Node.js](https://nodejs.org/) bản LTS (≥ 20) và npm (đi kèm Node).
- Không cần cài Python trên máy local — Python/ComfyUI chỉ chạy trên Colab.

## 2. Cài đặt lần đầu

```bash
npm install
npm run db:migrate
npm run db:seed
```

- `npm run db:migrate` tạo database SQLite tại `data/anima.sqlite` theo schema Prisma.
- `npm run db:seed` tạo dữ liệu mẫu **chỉ khi bảng đang trống**: prompt mặc định, 3 style mẫu (Anime Cinematic, Soft Illustration, Manga Art). Chạy lại không ghi đè dữ liệu bạn đã sửa.

Sao chép `.env.example` thành `.env` nếu bạn cần chỉnh `DATABASE_URL` hoặc thêm `COMFY_GATEWAY_TOKEN` (token cho gateway có xác thực, tùy chọn — không bắt buộc với LocalTunnel thông thường).

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

## 5. Kết nối ComfyUI trên Colab

1. Trong notebook Colab, chạy ComfyUI và tạo tunnel (ví dụ LocalTunnel), lấy URL dạng `https://xxxx.loca.lt`.
2. Vào **Cài đặt** trong app, dán URL vào ô "ComfyUI base URL", bấm **Lưu URL**, rồi bấm **Kiểm tra kết nối**.
3. Trạng thái ở header chỉ hiện "Đã kết nối" khi request `/system_stats` thành công thật — không dựa vào việc đã nhập URL.
4. Mỗi khi Colab restart, tunnel URL sẽ đổi. Quay lại **Cài đặt**, dán URL mới, kiểm tra lại kết nối.

**Cảnh báo bảo mật:** URL LocalTunnel trỏ thẳng tới ComfyUI không có lớp đăng nhập. Ai biết URL đều có thể gửi job tới máy bạn. Chỉ dùng cho thử nghiệm cá nhân, không chia sẻ URL, và dừng tunnel khi không dùng.

## 6. Import workflow và cấu hình node mapping

1. Trong ComfyUI, mở workflow Anima của bạn, chọn **Save (API Format)** để xuất file JSON.
2. Vào **Cài đặt → Workflow ComfyUI**, import file JSON đó.
3. App sẽ hiện danh sách node (ID, class type, input hiện có). Ở phần **Node mapping**, với từng trường (Positive prompt, Negative prompt, Seed, Width, Height, Steps, CFG, Sampler, Scheduler, Batch size):
   - Bật/tắt trường đó.
   - Chọn node tương ứng.
   - Chọn input key tồn tại trong node đó.
4. Bấm **Lưu mapping**, sau đó bấm **Validate mapping**. Trang Tạo ảnh chỉ hoạt động khi mapping hợp lệ (Positive prompt luôn bắt buộc).

Không có node ID nào bị hard-code trong code — bạn phải tự map theo đúng workflow của mình.

## 7. Xử lý lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| HTTP 502 khi kiểm tra kết nối | Tunnel/Colab vừa khởi động chưa xong, hoặc session đã dừng | Đợi vài giây rồi thử lại; nếu vẫn lỗi, mở lại notebook Colab |
| Tunnel URL đã cũ/hết hạn | Session Colab bị ngắt hoặc restart | Lấy URL tunnel mới, dán lại vào Cài đặt |
| Nhận HTML thay vì JSON | LocalTunnel hiện trang xác nhận (interstitial) | App đã tự gửi header bypass; nếu vẫn lỗi, mở URL đó bằng browser để xác nhận thủ công một lần |
| Lỗi parse JSON khi import workflow | File không đúng định dạng API, hoặc không phải export từ "Save (API Format)" | Export lại đúng cách từ ComfyUI |
| Mapping không hợp lệ | Node ID/input key không còn tồn tại trong workflow mới | Vào Cài đặt, chọn lại node/input, Validate lại |
| GPU out of memory / lỗi node khi tạo ảnh | Workflow/model vượt quá VRAM của GPU Colab | Giảm kích thước ảnh/steps, hoặc kiểm tra workflow trên ComfyUI trực tiếp |

## 8. Scripts

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

## 9. Công nghệ sử dụng

Next.js (App Router) + TypeScript, Tailwind CSS + shadcn/ui, Prisma + SQLite, Zod, React Hook Form, TanStack Query, Vitest.
