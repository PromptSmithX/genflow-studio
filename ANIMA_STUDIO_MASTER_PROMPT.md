# Master Prompt — Build Anima Studio (Local UI + ComfyUI on Google Colab)

> **Cách dùng:** Dùng toàn bộ nội dung file này làm **một prompt duy nhất** trong công cụ vibe coding đang mở repo dự án. Yêu cầu công cụ đọc kỹ spec rồi trực tiếp tạo/chỉnh sửa code để có một MVP chạy được end-to-end. Không chỉ trả lời bằng kế hoạch, wireframe, hay code minh họa. Nếu repo trống, tự khởi tạo project. Nếu có code sẵn, kiểm tra trước rồi tích hợp phù hợp.

## 1. Vai trò và mục tiêu

Bạn là senior full-stack engineer kiêm product designer. Hãy xây dựng một ứng dụng local-first có tên **Anima Studio** để người không rành kỹ thuật có thể tạo ảnh qua ComfyUI đang chạy trên GPU Google Colab.

Ứng dụng gồm:
- **Frontend/UI chạy local trên máy Windows của một người dùng.**
- **Next.js server/backend local** xử lý database, workflow JSON, kết nối và API calls. Trình duyệt không gọi thẳng ComfyUI.
- **ComfyUI trên Google Colab** là inference engine chạy model `One obsession_Anima v4.0`.
- **SQLite trên máy local** lưu prompt, style presets, cài đặt, job history và metadata ảnh.
- **Thư mục local** giữ file ảnh được tải về từ ComfyUI.

Mục tiêu là một MVP đẹp, có thể cấu hình và sử dụng thật ngay sau khi người dùng điền URL tunnel, import workflow API JSON và chọn node mapping. Không cần làm SaaS, multi-user, billing hay cloud database. Một người dùng trên một máy.

**Nguyên tắc quan trọng:**
1. Triển khai sản phẩm thực tế, không dừng ở plan hay scaffold trống.
2. Không hard-code ID node ComfyUI, vì workflow của người dùng có thể khác. Phải cho phép import workflow API JSON và cấu hình mapping từ UI.
3. Các style là dữ liệu trong database, không phải TypeScript enum hard-coded. UI có thể thêm/sửa/tắt style mà không cần sửa code.
4. Mọi prompt được snapshot khi tạo job; chỉnh prompt preset về sau không được thay đổi lịch sử đã tạo.
5. Không giả vờ tạo ảnh nếu kết nối/workflow chưa hoạt động. Hiển thị lỗi rõ ràng và hướng dẫn sửa.
6. Tránh TODO, placeholder page, mock backend hoặc nút không hoạt động trong luồng chính.

## 2. Tech stack bắt buộc

Dùng một stack thống nhất, ưu tiên ổn định trên Windows:

- Next.js App Router + React + TypeScript.
- Node.js runtime cho mọi API route cần truy cập filesystem, SQLite hoặc ComfyUI. Không dùng Edge runtime cho các route này.
- Tailwind CSS + shadcn/ui cho thành phần giao diện; Lucide icons.
- Prisma + SQLite cho persistence local.
- Zod để validate input ở API/server và form quan trọng.
- React Hook Form nếu hữu ích cho form quản lý prompt/settings.
- `sonner` hoặc hệ thống toast tương đương để thông báo thành công/lỗi.
- npm làm package manager.
- Cần có test tối thiểu cho hàm ghép prompt, workflow mapping và validation.

Hãy dùng phiên bản package stable, tương thích lẫn nhau tại thời điểm triển khai. Tạo tất cả file cấu hình cần thiết, Prisma schema, migrations hoặc lệnh setup rõ ràng, `.env.example`, `.gitignore`, README tiếng Việt và scripts để khởi chạy trên Windows.

### Chạy local và bảo vệ quyền truy cập

- Mặc định chỉ bind server vào `127.0.0.1`, không bind `0.0.0.0`.
- Script phát triển phải thuận tiện để chạy trên Windows, ví dụ `npm run dev`.
- Không yêu cầu người dùng cài Python để UI hoạt động. Python/ComfyUI chỉ chạy ở Colab trong kiến trúc hiện tại.
- Không đặt API secret vào client bundle, `NEXT_PUBLIC_*`, HTML hay logs.
- Không commit database local, generated images, tunnel URL hoặc token.

## 3. Visual design và trải nghiệm người dùng

Thiết kế thành ứng dụng desktop-first, hiện đại, gọn gàng, cao cấp nhưng dễ dùng cho người non-tech. UI cần responsive và có thể dùng trên màn hình laptop.

### Hướng thiết kế

- Mặc định light theme với nền neutral hơi ấm, typography rõ, khoảng cách thoáng, màu nhấn indigo/violet vừa phải.
- Dùng sidebar trái cố định hoặc collapsible, header gọn, nội dung có hierarchy rõ.
- Card bo góc vừa phải, border nhẹ, shadow tinh tế; tránh gradient quá nhiều, quá nhiều badge và card lồng card.
- Có empty states hữu ích, loading skeleton, progress state, error state và toast rõ ràng.
- Mọi nhãn hiển thị cho người dùng bằng tiếng Việt tự nhiên; giữ tên model/API/node trong trang cấu hình nếu cần.
- Không để các thuật ngữ như JSON, API, seed, CFG xuất hiện ở luồng tạo ảnh cơ bản nếu không cần. Các mục kỹ thuật để trong “Nâng cao” hoặc trang Cài đặt.
- UI không nên giống dashboard quản trị nặng nề; đây là công cụ sáng tạo ảnh.
- Dùng Lucide icons nhất quán. Không dùng emoji làm icon chính.
- Đảm bảo trạng thái focus, keyboard navigation, contrast đủ tốt và label gắn đúng form control.

### Layout chính

Sidebar có các mục:
1. **Tạo ảnh** — trang mặc định.
2. **Thư viện prompt** — quản lý prompt chung và style.
3. **Lịch sử** — lịch sử batch/job và ảnh đã tạo.
4. **Cài đặt** — kết nối ComfyUI/Colab, workflow, node mapping và thông số mặc định.

Header hiển thị trạng thái kết nối: `Chưa cấu hình`, `Đang kiểm tra`, `Đã kết nối`, `Mất kết nối`. Không báo `Đã kết nối` chỉ vì URL đã được nhập; chỉ báo khi request kiểm tra thành công.

## 4. Trang “Tạo ảnh” — luồng chính

Đây là trang người dùng phổ thông sử dụng hằng ngày. Ưu tiên rõ ràng và ít thao tác.

### 4.1. Ý tưởng chung

- Có textarea lớn với label **“Bạn muốn tạo ảnh gì?”**.
- Placeholder gợi ý một câu mô tả tự nhiên, ví dụ: “Một cô gái tóc xanh đứng trong khu vườn ngập nắng, mặc trang phục phong cách anime.”
- Ý tưởng có thể để trống chỉ khi app cho phép; tốt nhất yêu cầu có ý tưởng hoặc prompt bổ sung trước khi tạo để tránh job rỗng.
- Ghi chú nhỏ: “Mô tả bằng tiếng Việt hoặc tiếng Anh. Bạn có thể xem và chỉnh prompt đầy đủ trước khi tạo.”

### 4.2. Số lượng ảnh và lựa chọn style theo từng ảnh

- Cho người dùng chọn số ảnh, mặc định 1; giới hạn MVP từ 1 đến 8 ảnh mỗi batch để tránh gửi quá nhiều job ngoài ý muốn.
- Khi số lượng thay đổi, tạo/xóa đúng số card cấu hình tương ứng.
- Mỗi card có `Ảnh 1`, `Ảnh 2`, … và dropdown chọn một **style đang hoạt động trong database**.
- Mỗi ảnh có thể có một field tùy chọn **“Chi tiết riêng cho ảnh này”** (positive bổ sung) để tạo khác biệt nhỏ mà không thay đổi ý tưởng chung.
- Có thể thêm field negative bổ sung riêng cho ảnh trong phần nâng cao, nhưng không bắt buộc hiển thị mặc định.
- Style selector phải lấy dữ liệu thật từ SQLite qua API, không hard-code options trong UI.
- Nếu không có style active, hiển thị hướng dẫn tạo style trong “Thư viện prompt”; không để select rỗng rồi submit âm thầm.
- Khi thay đổi số ảnh, giữ lựa chọn style và ghi chú hiện tại của những hàng vẫn còn; hàng mới chọn style mặc định đầu tiên đang active.
- Phân biệt rõ: **ý tưởng chung áp dụng cho tất cả ảnh**, còn **style và chi tiết riêng có thể khác nhau theo từng ảnh**.

### 4.3. Thông số tạo ảnh

Đặt trong accordion “Thông số nâng cao”, mặc định thu gọn:
- Width, mặc định 1024.
- Height, mặc định 1024.
- Steps, mặc định 25.
- CFG, mặc định 4.0.
- Seed mode: `Ngẫu nhiên cho từng ảnh` (default) hoặc `Dùng seed cố định`.
- Khi seed cố định được chọn, hiện input seed số nguyên. Nếu dùng cố định với nhiều ảnh, cho phép dùng cùng seed hoặc tăng seed theo từng ảnh; ghi rõ cách hoạt động.
- Sampler và scheduler chỉ hiển thị/chỉnh sửa nếu workflow mapping có trường tương ứng; không để người dùng chọn giá trị mà workflow không sử dụng.
- Batch size mặc định 1 cho mỗi job, vì mỗi ảnh có thể dùng style khác nhau.
- Validate giá trị hợp lệ phía client và server; không tin input từ client.

Giá trị mặc định phải lấy từ Settings/SQLite; giá trị thay đổi trong form có thể dùng cho batch hiện tại mà không bắt buộc ghi đè defaults. Có một action rõ ràng “Lưu thành mặc định” nếu người dùng muốn lưu lại.

### 4.4. Preview prompt đã ghép

- Mỗi card ảnh có accordion `Xem prompt sẽ dùng`.
- Hiển thị final positive và final negative sau khi ghép global prompt + ý tưởng + style prompt + chi tiết riêng.
- Hiển thị riêng phần “Prompt chung”, “Phong cách”, “Chi tiết riêng” để người dùng dễ hiểu vì sao prompt được tạo ra như vậy.
- Cho phép override prompt positive/negative ngay cho job hiện tại trong phần nâng cao, nhưng không thay đổi preset trong thư viện nếu chưa bấm “Lưu vào thư viện prompt”. Nếu để scope quá phức tạp thì tối thiểu phải có preview readonly và ghi rõ nơi sửa preset.
- Khi prompt library được chỉnh sửa, trang tạo ảnh sử dụng phiên bản mới cho batch tiếp theo.

### 4.5. Tạo và theo dõi

- Nút chính rõ ràng: **“Tạo ảnh”**.
- Disable nút khi app chưa có connection settings, ComfyUI không kết nối được, workflow chưa import/chưa validate, mapping thiếu trường bắt buộc hoặc không có style.
- Khi bấm tạo: hiển thị confirmation summary ngắn: tổng số ảnh và style; không cần modal xác nhận nếu chỉ một ảnh.
- Server tạo một batch, snapshot đầy đủ prompt/cài đặt/style cho từng job rồi gửi mỗi job như một workflow request độc lập tới `POST /prompt` của ComfyUI. Mỗi ảnh có thể dùng style khác nhau, vì vậy không dùng chung một batch_size workflow cho các style khác nhau.
- ComfyUI có thể chạy tuần tự trong queue; UI không được hứa tạo song song nếu runtime chỉ có một GPU.
- Sau khi gửi thành công, chuyển sang panel theo dõi batch với trạng thái từng ảnh: `Đang chờ`, `Đang tạo`, `Hoàn thành`, `Thất bại`.
- Thể hiện phần trăm nếu có dữ liệu đáng tin cậy; nếu không có thì dùng spinner/queue state, không bịa %.
- Cung cấp nút “Xem ảnh” khi xong, “Thử lại” khi thất bại và “Mở lịch sử”. Không retry tự động một request submit chưa rõ kết quả vì có thể tạo job trùng.
- Giữ batch trong DB ngay cả khi reload trang. Khi người dùng quay lại trang, app tải trạng thái từ DB và đồng bộ với ComfyUI nếu runtime còn online.
- Polling interval khởi đầu khoảng 2–3 giây, có cleanup, không tạo nhiều poll vòng lặp trùng nhau. Không bắt buộc WebSocket cho MVP.

## 5. Prompt Library — prompt chung và style presets

Tạo trang quản lý prompt riêng, có cấu trúc rõ ràng. Sử dụng dữ liệu trong SQLite.

### 5.1. Prompt chung (global defaults)

Có tab/section “Prompt mặc định” với hai trường textarea độc lập:
- `Positive prompt mặc định`: chất lượng/đặc điểm chung cần áp dụng cho mọi ảnh.
- `Negative prompt mặc định`: các đặc điểm cần tránh nói chung.

Tính năng:
- Xem, sửa, lưu, hủy thay đổi.
- Hiển thị cập nhật gần nhất.
- Có preview ghép thử với style đang chọn nếu đơn giản để triển khai.
- Mọi giá trị được lưu trong SQLite, không chỉ trong localStorage.
- Không tự động overwrite nội dung người dùng khi seed dữ liệu lần đầu. Seed chỉ tạo dữ liệu mẫu nếu database hoàn toàn chưa có bản ghi tương ứng.

Có thể cung cấp nội dung mẫu editable cho negative prompt, ví dụ `blurry, low quality, malformed anatomy, extra fingers, watermark, unwanted text`, nhưng gắn nhãn đây chỉ là mẫu và cho phép xóa hoàn toàn. Không hard-code chuỗi này trong code tạo ảnh.

### 5.2. Style library

Mỗi style có:
- `id` ổn định (UUID hoặc CUID).
- `name` duy nhất, dễ hiểu, ví dụ “Anime Cinematic”.
- `description` ngắn bằng ngôn ngữ phổ thông.
- `positivePrompt` — phần positive bổ sung của style.
- `negativePrompt` — phần negative bổ sung riêng của style, có thể để trống.
- `isActive` — bật/tắt việc xuất hiện ở trang Tạo ảnh.
- `sortOrder`.
- `createdAt`, `updatedAt`.

Các thao tác:
- Xem danh sách style dạng card/list.
- Tìm kiếm theo tên.
- Tạo mới, sửa, lưu, hủy, nhân bản, bật/tắt, xóa.
- Xóa style đã được dùng trong history phải giữ nguyên snapshot lịch sử; nếu có liên kết FK, dùng soft disable/archive hoặc `onDelete: SetNull` và giữ `styleNameSnapshot` trên job.
- Hiển thị preview positive/negative của style.
- Cảnh báo nếu tên trùng.
- Không dùng TypeScript enum cho danh sách style. Style options luôn đọc từ DB.
- Seed 3 style mẫu có thể sửa/xóa: `Anime Cinematic`, `Soft Illustration`, `Manga Art`. Mỗi style cần mô tả và positive prompt minh họa; không tự tuyên bố các prompt mẫu đã tối ưu cho Anima. Chỉ seed nếu bảng style rỗng.

### 5.3. Quy tắc ghép prompt

Tạo helper thuần `buildPrompts` ở server, có test. Input gồm global positive/negative, ý tưởng chung, style positive/negative và per-image positive/negative overrides.

Positive final ghép theo thứ tự:
1. Positive prompt mặc định.
2. Ý tưởng chung của người dùng.
3. Positive prompt của style được chọn.
4. Chi tiết riêng/positive override của ảnh.

Negative final ghép theo thứ tự:
1. Negative prompt mặc định.
2. Negative prompt của style.
3. Negative override riêng của ảnh (nếu có).

Quy tắc:
- Trim từng phần; loại phần rỗng; nối bằng `, ` cho prompt kiểu tag, hoặc dùng một helper rõ ràng để tránh dấu phẩy thừa. Không thêm chuỗi `undefined`, `null` hay dấu phân cách thừa.
- Không xóa/sắp xếp/deduplicate nội dung prompt của người dùng theo cách có thể làm thay đổi ý nghĩa; chỉ làm sạch whitespace bên ngoài.
- Snapshot final prompts vào job trước khi gửi sang ComfyUI.
- Không yêu cầu model “tự hiểu” các tên style. Style chỉ là dữ liệu prompt được thêm vào workflow.

## 6. Lịch sử tạo ảnh

Trang lịch sử hiển thị dữ liệu thật từ SQLite, không mock.

### Hiển thị
- Lưới thumbnail của ảnh local đã tải về.
- Tên batch/ngày giờ, style, kích thước, trạng thái.
- Nhóm theo batch: một batch có thể chứa nhiều job/style.
- Bộ lọc theo thời gian, style, trạng thái; tìm kiếm theo ý tưởng/prompt nếu khả thi.
- Pagination hoặc “Load more” nếu lịch sử dài.

### Chi tiết job
Khi mở ảnh/job, hiển thị:
- Hình ảnh lớn, nút tải/mở file local.
- Positive final, negative final.
- Ý tưởng chung, style name snapshot và prompt style snapshot.
- Seed, width, height, steps, CFG và các thông số đã sử dụng.
- Thời gian bắt đầu/kết thúc, status, lỗi (nếu có), ComfyUI prompt ID.
- Nút copy positive/negative prompt.
- Nút tạo lại: tạo job mới từ snapshot prompt/config; cho chọn seed cũ hoặc seed ngẫu nhiên mới. Tạo lại không ghi đè job cũ.
- Nút mở thư mục chứa ảnh hoặc tải ảnh qua browser nếu hệ điều hành hỗ trợ.

### Lưu file ảnh
- Lưu trong thư mục local `data/outputs/` (hoặc output directory cấu hình được) bên trong project cho MVP.
- Không lưu toàn bộ binary ảnh trong SQLite; DB chỉ lưu metadata và relative path.
- Tạo tên file dễ hiểu, an toàn và chống trùng, có timestamp + job ID/unique suffix.
- Validate đường dẫn khi đọc ảnh; không cho path traversal.
- Serve file thông qua API route lấy theo image ID từ database, không nhận arbitrary filesystem path từ request.
- Bảo đảm ảnh hiện trong UI sau khi đã download thành công.

## 7. Trang Cài đặt — kết nối Colab/ComfyUI và workflow

Đây là phần quyết định ứng dụng có thật sự hoạt động với workflow Anima đã có của người dùng hay không. Không hard-code IDs.

### 7.1. Kết nối

Fields:
- `ComfyUI base URL`: ví dụ `https://<current-tunnel>.loca.lt`; trim whitespace và bỏ trailing slash.
- Nút `Kiểm tra kết nối`.
- Hiển thị trạng thái, thời gian kiểm tra, version ComfyUI và GPU/VRAM nếu `/system_stats` cung cấp.
- Timeout cấu hình hợp lý.
- Cài header mặc định `bypass-tunnel-reminder: 1` cho LocalTunnel nếu cần để bypass interstitial, nhưng nếu phản hồi vẫn là HTML/login/502 thì phát hiện và hiển thị lỗi rõ. Header này không phải cơ chế bảo mật.
- Hỗ trợ optional server-side bearer/API token để dùng với gateway có xác thực ở tương lai; không gửi secret về client. Không giả định ComfyUI mặc định hỗ trợ bearer token.
- Lưu cài đặt connection trong SQLite local hoặc server-side env; chỉ một người dùng local.
- Có nút “Xóa URL đã lưu”.
- Nếu tunnel URL thay đổi, người dùng có thể thay URL rồi bấm test; không cần sửa source code.

**Cảnh báo bảo mật bắt buộc trong UI:** LocalTunnel URL trực tiếp tới ComfyUI không tự tạo lớp đăng nhập API. Người nào biết/được URL có thể thử gửi tác vụ đến server. Coi đây chỉ là setup thử nghiệm cá nhân, không chia sẻ URL và dừng tunnel khi không dùng. Không viết copy khẳng định URL bí mật là cơ chế bảo vệ đủ mạnh. Cho phép cấu hình gateway có token trong tương lai.

### 7.2. Import workflow API JSON

- Có upload file workflow API-format JSON từ ComfyUI (`Save (API Format)`), lưu file server-side dưới `data/workflows/` và không dùng file upload làm code thực thi.
- Validate JSON parse được và là object không rỗng. Hiển thị tên file, ngày import, số node và tình trạng validation.
- Cho phép thay workflow, xem/download bản đã import, xóa workflow.
- Không gửi workflow JSON tới browser nếu không cần; node summaries có thể được trả về để cấu hình mapping.
- Nếu chưa import workflow, trang tạo ảnh phải báo rõ “Chưa cấu hình workflow”; không gửi job.

### 7.3. Node mapping config (bắt buộc)

Không được mặc định ID node là `6`, `7`, v.v. vì ID thay đổi theo workflow. Sau khi import, parse các node API JSON để hiển thị:
- Node ID.
- `class_type`.
- Các input key và giá trị hiện tại (giá trị dài được rút gọn).

Cho người dùng chọn node + input field cho những mapping sau:
- Positive prompt — required.
- Negative prompt — required nếu workflow có negative input; nếu workflow không dùng negative prompt thì cho phép tắt mapping có xác nhận rõ.
- Seed — required để mỗi ảnh có seed kiểm soát được, trừ khi workflow thực sự không dùng seed; nếu không map được thì cảnh báo.
- Width — optional/required khi workflow exposed field.
- Height — optional/required khi workflow exposed field.
- Steps — optional.
- CFG — optional.
- Sampler — optional.
- Scheduler — optional.
- Batch size — optional; mặc định 1 nếu field được map.

Mỗi mapping lưu `nodeId`, `inputKey`, `enabled`. Dropdown chỉ cho chọn input key tồn tại trong node đã chọn. UI hiện class type và current value để người dùng nhận biết đúng node. Có nút `Validate mapping` kiểm tra tất cả node/key có trong workflow và loại/kiểu dữ liệu phù hợp.

Mọi mapping được lưu trong SQLite. Cần hỗ trợ mapping tới các loại node khác nhau; không giả định node class là `CLIPTextEncode` vì workflow Anima có thể dùng node encoding khác. Prompt fields thường là text input, nhưng người dùng phải tự xác nhận mapping đúng.

### 7.4. Workflow runtime

- Khi tạo job, đọc workflow API JSON từ file server-side và deep-clone trước khi sửa; không sửa object dùng chung.
- Đọc mapping đã lưu. Với mỗi trường mapping enabled, cập nhật `workflow[nodeId].inputs[inputKey]` tương ứng.
- Nếu node, `inputs` hoặc input key không tồn tại, dừng trước khi gọi ComfyUI và đưa lỗi dễ hiểu.
- Set positive final, negative final, seed, width, height, steps, cfg, sampler và scheduler chỉ khi mapping enabled.
- Đối với nhiều ảnh khác style, gửi mỗi ảnh một workflow riêng với mapping riêng; không thay đổi file workflow gốc.
- `batch_size` đặt 1 nếu mapping có và cần một ảnh/job.
- Tạo seed ngẫu nhiên trong phạm vi integer an toàn cho JavaScript/ComfyUI khi random mode; lưu seed cuối cùng vào job.
- Trước lần gửi đầu tiên, cho phép validate workflow và mapping mà không tạo ảnh.
- Nếu request API có `node_errors`, không coi như thành công; lưu/surface lỗi.

## 8. ComfyUI API integration

Việc gọi ComfyUI phải chỉ diễn ra ở server-side Next.js route/service, không ở client browser.

Các endpoint ComfyUI thường dùng:
- `GET /system_stats` — connection test.
- `POST /prompt` — gửi `{ prompt: workflowApiJson, client_id?: ... }`.
- `GET /history/{prompt_id}` — kiểm tra output sau khi hoàn tất.
- `GET /queue` — trạng thái queue nếu cần.
- `GET /view?filename=...&subfolder=...&type=...` — tải file ảnh output.

Sử dụng endpoint đúng với version ComfyUI hiện tại; nếu docs/server khác, đọc docs hoặc phản hồi endpoint thực tế thay vì đoán.

### Submit generation
1. Validate request và connection settings.
2. Validate workflow + mappings.
3. Snapshot prompt/style/default values vào DB và tạo Batch + Jobs.
4. Với mỗi Job, build workflow đã map và gửi đến `/prompt`.
5. Nếu trả `prompt_id`, lưu ID và status `queued`.
6. Nếu HTTP error, HTML tunnel interstitial, 502/timeout, JSON lỗi hoặc `node_errors`, đánh dấu job failed với thông báo phù hợp. Không tự retry submit mù quáng khi timeout vì có thể job đã được queue; trước retry phải kiểm tra tình trạng nếu có thể.
7. Trả response cho UI gồm batch ID, jobs và status ban đầu.

### Sync job state
- Client polling API route local khoảng 2–3 giây khi batch active.
- Local backend gọi `/history/{prompt_id}` và `/queue` khi cần, với timeouts ngắn và giới hạn concurrency.
- Khi job completed, parse `outputs[*].images[]` từ history. Với mỗi image metadata, GET `/view` bằng `filename`, `subfolder`, `type` do ComfyUI trả về; không tự tin tưởng arbitrary URL trong response.
- Lưu ảnh vào `data/outputs/`, tạo GeneratedImage DB records, rồi mark job `completed`.
- Nếu completed nhưng không có image, mark error có mô tả.
- Nếu ComfyUI offline/tunnel chết giữa chừng, không xoá job; set status/error thích hợp và cho người dùng bấm “Kiểm tra lại”.
- Việc polling phải tránh tải cùng một file nhiều lần và tránh tạo record ảnh duplicate.
- Không giữ request HTTP mở trong suốt thời gian generation. `POST /prompt` chỉ queue job và trả về nhanh.
- Nếu app browser đóng trong lúc job chạy, ComfyUI vẫn có thể chạy. Khi người dùng mở lại, app phải sync lại job bằng `prompt_id` nếu ComfyUI/history còn tồn tại. Hiển thị đúng giới hạn nếu runtime Colab đã bị ngắt hoặc history không còn.

### Lỗi tunnel
Phân biệt rõ:
- URL chưa được nhập.
- URL trả 502.
- Tunnel URL đã cũ/đổi.
- Phản hồi HTML trang LocalTunnel thay vì JSON API.
- ComfyUI không phản hồi tại tunnel.
- ComfyUI phản hồi nhưng workflow validation lỗi.
- Job chạy lỗi ở node.

Thông báo cho người dùng bằng tiếng Việt, có hành động đề xuất như “Kiểm tra URL”, “Mở Cài đặt”, “Thử kết nối lại”; tránh chỉ hiển thị stack trace. Chi tiết debug có thể mở trong “Thông tin lỗi”.

## 9. API routes local cần xây

Tạo các Route Handlers server-side, dùng Zod validate request và trả lỗi chuẩn `{ error: { code, message, details? } }`.

Đề xuất route structure (được phép điều chỉnh nếu giữ nguyên chức năng):

- `GET /api/health` — health check local app/database.
- `GET /api/connection/status` — status mới nhất/cấu hình redacted.
- `POST /api/connection/test` — test `/system_stats`, trả version/GPU/VRAM.
- `GET /api/settings` / `PUT /api/settings` — connection, default generation settings, output prefs.
- `GET /api/prompts/global` / `PUT /api/prompts/global` — global positive/negative.
- `GET /api/styles` / `POST /api/styles` — list/create styles.
- `GET /api/styles/[id]` / `PUT /api/styles/[id]` / `DELETE /api/styles/[id]` — CRUD/soft delete.
- `POST /api/workflow/import` — multipart upload API-format workflow JSON.
- `GET /api/workflow` — workflow/node summary + current mapping status.
- `DELETE /api/workflow` — clear imported workflow/config.
- `PUT /api/workflow/mapping` — save mapping.
- `POST /api/workflow/validate` — validate workflow/mapping without generation.
- `POST /api/generations` — create batch and enqueue individual jobs.
- `GET /api/generations/[batchId]` — batch and job status.
- `POST /api/generations/[batchId]/sync` — sync local job status/download outputs.
- `GET /api/history` — paginated/filterable batch/job/image history.
- `GET /api/history/[jobId]` — job detail.
- `POST /api/history/[jobId]/regenerate` — clone snapshot settings into a new job.
- `GET /api/images/[imageId]` — securely stream local image by DB image ID.
- `GET /api/images/[imageId]/download` — download with filename.

Avoid overengineering route count if the same functionality is implemented cleanly; keep client/server types aligned. Never expose raw filesystem paths or secrets in API responses.

## 10. Database design (Prisma + SQLite)

Design migrations and relations for at least these entities. Names may vary if relationships and fields are equivalent.

### `GlobalPrompt`
- `id` singleton key (e.g. `main`).
- `positivePrompt` string/text default empty.
- `negativePrompt` string/text default empty.
- `updatedAt`.

### `StylePreset`
- `id` string UUID/CUID.
- `name` unique.
- `description` nullable.
- `positivePrompt` text default empty.
- `negativePrompt` text default empty.
- `isActive` boolean default true.
- `sortOrder` integer default 0.
- `createdAt`, `updatedAt`.

### `AppSettings`
- singleton `id`.
- `comfyBaseUrl` nullable string.
- Optional gateway token stored server-side only if supported; never return it in GET response (return boolean like `hasToken`). Prefer environment variable for secret.
- `defaultWidth`, `defaultHeight`, `defaultSteps`, `defaultCfg`.
- `defaultSeedMode` and optional fixed seed.
- `maxImagesPerBatch` default 8.
- `outputDirectory` relative or resolved safe path (default `data/outputs`).
- `createdAt`, `updatedAt`.

### `WorkflowConfig`
- singleton `id`.
- `workflowRelativePath` string.
- `originalFilename` string.
- `nodeMappingJson` JSON/text field containing enabled node mappings.
- `isValidated` boolean and `validatedAt` nullable.
- `updatedAt`.

### `GenerationBatch`
- `id`.
- `ideaPrompt` text.
- `status`: queued/running/completed/partial/failed.
- `requestedCount` integer.
- `createdAt`, `updatedAt`.

### `GenerationJob`
- `id`, `batchId`, `indexInBatch`.
- `styleId` nullable FK and `styleNameSnapshot`.
- `ideaPromptSnapshot`, `positiveFinal`, `negativeFinal`.
- `promptId` nullable (ComfyUI prompt_id).
- `status`: queued/running/completed/failed/unknown; use one consistent enum.
- `seed`, `width`, `height`, `steps`, `cfg`, sampler/scheduler nullable.
- `stylePositiveSnapshot`, `styleNegativeSnapshot` nullable.
- `errorMessage` nullable; concise `errorCode` nullable.
- `submittedAt`, `startedAt`, `finishedAt` nullable.
- `createdAt`, `updatedAt`.
- Keep enough snapshot data to reproduce/regenerate without reading current style prompt.

### `GeneratedImage`
- `id`, `jobId` FK.
- `relativePath`, `filename`, `mimeType`, `width`/`height` nullable.
- `createdAt`.

Indexes needed for createdAt, batchId, status, styleId and promptId queries. Use appropriate cascading/SetNull relations without deleting history accidentally when a style preset is archived/deleted.

### Initial seed behavior

- On first run, initialize singleton settings/global prompt rows and add a few editable example styles only if the relevant tables are empty.
- Do not reset or overwrite user edits on normal app start.
- Include a clear “Reset sample data” option only if safe and not necessary for MVP; do not implement a destructive reset button by default.

## 11. App state and prompt correctness

- Define TypeScript types for every major API input/output and database DTO.
- Store final prompt snapshots on server before remote submit, so a later style edit cannot mutate an in-flight job.
- Ensure a submit operation creates a unique batch and one unique job per requested image.
- Validate count range, active style IDs, input lengths and numeric generation settings.
- Use `crypto.randomUUID()` or equivalent for IDs where useful.
- Don't mutate shared workflow JSON from one job to the next; deep-clone each one.
- No silent fallback to the first style if the requested style ID is invalid; return validation error.
- Prevent duplicate image records if a sync endpoint is called repeatedly.
- Avoid stale form state when adding/removing image cards.
- Use explicit status transitions and preserve failure information.
- Handle app restart and DB read after restart. Do not rely on in-memory arrays for persistent data.

## 12. Error handling and loading states

For every form/action:
- Display field validation inline.
- Disable submit while an operation is in progress.
- Avoid double submit.
- Show success/error toast.
- Use friendly Vietnamese error copy and optionally reveal technical details in expandable disclosure.

Scenarios to handle:
- Database not initialized/migration missing: provide an actionable startup message and README instructions.
- ComfyUI URL invalid or network timeout.
- Tunnel URL changed/expired or returns 502/HTML interstitial.
- Workflow JSON malformed or not API format.
- Mapping points to missing node/field or an incompatible input type.
- Positive/negative mappings missing.
- API `/prompt` returns validation errors or `node_errors`.
- Remote GPU out of memory / ComfyUI error.
- Colab session dies during a queued/running job.
- History completed without image output.
- Download fails, disk is full, or output directory isn't writable.
- Same batch is synced multiple times.
- Style preset gets disabled while a draft generation form is open.

Never expose raw secrets, token, full auth headers, or secret-bearing URL parameters in logs/UI. Sanitize error payloads before storing in database. Avoid logging the full prompt by default at info level if it may include private content; prompt is available in protected local history.

## 13. Security and local-first constraints

- Bind app to loopback `127.0.0.1`; show startup instructions to avoid hosting it publicly.
- All ComfyUI network calls from server-side only.
- Do not expose bearer tokens, API keys, or auth headers to client code.
- If using `bypass-tunnel-reminder`, add it in backend request headers. Do not treat it as auth.
- Add visible warning in Settings when using a public tunnel directly to unauthenticated ComfyUI. Explain it is acceptable only for temporary personal testing; don't share the URL and stop the tunnel when done. For real remote/shared usage, recommend an authenticated gateway/tunnel.
- Validate `comfyBaseUrl` protocol as HTTP(S), prevent arbitrary non-HTTP schemes, and do not accept a URL from an untrusted request body as an unrestricted server-side fetch target; only use saved admin-configured URL. This is a localhost single-user app, but still validate URLs to reduce SSRF risk.
- For file upload: accept JSON only, limit size (e.g. 10 MB), validate object structure and save under `data/workflows` with generated safe filename; don't preserve arbitrary upload paths.
- For generated images: resolve stored relative paths within output root and reject traversal/symlink escapes.
- Do not delete old workflow/file data implicitly when importing a new one; retain backup or overwrite only after validation succeeds.
- Keep `data/`, `*.sqlite`, `.env.local`, local workflows and outputs out of Git.

## 14. Suggested folder structure

Use a clear structure similar to:

```text
anima-studio/
├── app/
│   ├── (studio)/
│   │   ├── create/page.tsx
│   │   ├── prompts/page.tsx
│   │   ├── history/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── health/route.ts
│   │   ├── connection/test/route.ts
│   │   ├── settings/route.ts
│   │   ├── prompts/global/route.ts
│   │   ├── styles/route.ts
│   │   ├── styles/[id]/route.ts
│   │   ├── workflow/import/route.ts
│   │   ├── workflow/route.ts
│   │   ├── workflow/mapping/route.ts
│   │   ├── workflow/validate/route.ts
│   │   ├── generations/route.ts
│   │   ├── generations/[batchId]/route.ts
│   │   ├── generations/[batchId]/sync/route.ts
│   │   ├── history/route.ts
│   │   ├── history/[jobId]/route.ts
│   │   ├── history/[jobId]/regenerate/route.ts
│   │   └── images/[imageId]/route.ts
│   ├── layout.tsx
│   ├── page.tsx (redirect to /create)
│   └── globals.css
├── components/
│   ├── app-shell/
│   ├── create/
│   ├── prompts/
│   ├── history/
│   ├── settings/
│   └── ui/
├── lib/
│   ├── db.ts
│   ├── validations/
│   ├── prompts/build-prompts.ts
│   ├── comfyui/client.ts
│   ├── comfyui/workflow-mapper.ts
│   ├── comfyui/job-sync.ts
│   ├── files/safe-output.ts
│   └── api/errors.ts
├── prisma/schema.prisma
├── prisma/seed.ts
├── data/.gitkeep
├── tests/
├── .env.example
├── .gitignore
├── README.md
└── package.json
```

This is a guide, not a requirement to create every listed route if you implement an equivalent consistent design. Do not create empty routes just to match this tree.

## 15. Testing requirements

Add real tests for pure functions and schema logic, such as:

1. Prompt builder joins all components in the right order, handles blank values and trims whitespace without creating extra separators.
2. Workflow mapper updates only configured node input fields and leaves unrelated fields unchanged.
3. Workflow mapper returns useful validation error if node ID/input key doesn't exist.
4. Seed generation is valid and repeatable when fixed seed is selected.
5. URL validator rejects unsupported schemes and malformed URL.
6. History/image path resolver rejects traversal outside `data/outputs`.

Add an integration or mocked test around ComfyUI client verifying handling of:
- `/system_stats` 200 JSON.
- `/prompt` returning prompt ID.
- `/prompt` returning `node_errors` or non-200.
- `/history/{prompt_id}` returning image metadata.
- `/view` binary download.

Tests must not require a live Colab tunnel to pass. Use mocks/fakes for external ComfyUI tests.

## 16. README and setup requirements

Write a practical README in Vietnamese containing:
- Prerequisites (Node.js LTS, npm, Windows).
- Install commands.
- Prisma migration/seed commands.
- Dev run command.
- Where SQLite DB, workflow JSON and downloaded images are stored.
- How to put the current LocalTunnel URL into Settings and test connection.
- How to export `Save (API Format)` JSON from ComfyUI and import it.
- How to map positive/negative/seed/width/height/steps/CFG fields.
- How to troubleshoot HTTP 502, expired tunnel, JSON parse error, invalid node mapping and GPU error.
- Security warning about public tunnel and unauthenticated direct ComfyUI access.
- Note that Colab sessions can stop and tunnel URLs can change; users must update URL on new sessions.
- How to back up/restore prompt library, workflow config and image folder.

Provide npm scripts along the lines of `dev`, `build`, `start`, `lint`, `test`, `db:migrate`, `db:seed`, `db:studio` as appropriate. Verify `npm run lint`, `npm run test` and `npm run build` pass before finishing, or explicitly report any environmental blocker with the exact reason.

## 17. Acceptance criteria — product must work end-to-end

The implementation is complete only when all criteria below are satisfied:

### UI and prompt management
- [ ] App starts on local machine and opens to a polished Vietnamese Create page.
- [ ] Sidebar navigation to Create, Prompt Library, History, Settings works.
- [ ] User can edit/save global positive and negative prompt; values persist after restart.
- [ ] User can create/edit/duplicate/enable/disable style presets; style list is database-driven.
- [ ] Style selector on Create page reflects database changes without code edits or restart where feasible.
- [ ] User can choose 1–8 images, select an individual style per image, and enter optional per-image details.
- [ ] Final prompt preview is correct for each image.
- [ ] Advanced settings validate and persist defaults only when explicitly saved.

### Workflow and connection
- [ ] User can input/save current tunnel URL and test it.
- [ ] Connection status is based on real `/system_stats` result.
- [ ] User can import API-format JSON, inspect node IDs/class types/input keys and save node mappings via UI.
- [ ] Invalid mappings are caught before generation.
- [ ] Workflow JSON is cloned per job and only configured mapped fields are modified.
- [ ] UI/backend does not assume specific node IDs or specific text encoder node class.

### Generate and history
- [ ] Clicking Generate creates a persistent batch and one distinct job for each selected image/style.
- [ ] Each job is submitted to ComfyUI `/prompt` with the correct positive/negative/seed/settings according to mapping.
- [ ] UI polls and shows real statuses without fake progress.
- [ ] Completed images are downloaded and saved to local output folder.
- [ ] Images display in the app and survive app restart.
- [ ] History shows images and stores the final prompt/style/settings snapshot for every job.
- [ ] User can retry/regenerate a job without overwriting old history.
- [ ] Errors are understandable, persistent and don't cause duplicate submits on blind retries.

### Quality, security, maintainability
- [ ] No core page is a placeholder; no fake generated image or mocked successful connection.
- [ ] TypeScript passes without unresolved core type errors.
- [ ] Tests cover prompt builder, workflow mapping and safe file paths.
- [ ] No secrets are exposed to client browser or committed to repository.
- [ ] Next.js server is configured for local-only usage and documents public tunnel warning.
- [ ] README lets a non-expert start the app and configure the Colab connection/workflow.

## 18. Implementation instructions to the coding agent

Read the entire specification first. Then **implement the complete MVP directly in the repository now**.

- Do not split this work into milestones or stop after writing an implementation plan.
- Do not ask questions when a sensible default can be chosen; make reasonable decisions and document configurable choices in README/UI.
- If the repository is empty, bootstrap the project. If files exist, inspect and preserve useful work.
- Create actual functioning React pages, APIs, database schema/migrations, seed data, ComfyUI integration, tests and README.
- Use the current stable versions of dependencies and resolve type/build problems rather than leaving instructions for the user to fix them manually.
- Do not assume user-specific workflow node IDs; implement import and node mapping in UI before generation.
- If an external workflow/tunnel is not available during development, mock it only in tests, not in the application’s default runtime. The UI must report “not configured” instead of showing fake success.
- After implementation, run available install, migration, lint, tests and production build commands. Fix errors that can be fixed in the environment.
- At the end, give a concise Vietnamese summary of files/features implemented, exact commands to launch on Windows, how to import workflow and configure node mapping, and any real blocker that remains. Be honest about anything not verified.

## Reference docs

Use official docs when necessary; do not copy outdated API assumptions blindly:
- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- ComfyUI server/API routes: https://github.com/Comfy-Org/docs/blob/main/development/comfyui-server/comms_routes.mdx
- ComfyUI API examples: https://github.com/Comfy-Org/ComfyUI/tree/master/script_examples
- ComfyUI Anima guide: https://docs.comfy.org/tutorials/image/anima/anima
- Prisma SQLite: https://www.prisma.io/docs/orm/overview/databases/sqlite
