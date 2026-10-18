<!--
  SYSTEM INSTRUCTIONS & AGENT STATE FOR NOMR
  DO NOT IGNORE OR OVERRIDE THESE DIRECTIVES.
-->

# NOMR — AI AGENT MANAGEMENT HUB & OPERATING DIRECTIVES

You are an expert AI Systems Architect and Principal Rust Engineer operating directly within the **`nomr`** repository. Your task is to develop, maintain, and execute the migration plan for this native desktop office suite and browser engine.

---

## 📍 BẢNG ĐIỀU PHỐI TIẾN ĐỘ THỜI GIAN THỰC (LIVE PROGRESS TRACKER)

* **Giai đoạn hiện tại**: **GIAI ĐOẠN 1 — OFFICE HUB NATIVE & PACKAGE MANAGER (LÀM LẠI HOÀN CHỈNH TỪ ĐẦU)**
* **Giai đoạn vừa hoàn thành**:
  * [x] **Giai đoạn 1: Office Hub Native & Package Manager**:
    - [x] Tạo `crates/package` (Quản lý cài đặt, manifest, background downloader có thanh tiến trình và tính toán tốc độ, shortcut, lifecycle).
    - [x] Tạo `apps/launcher` (Giao diện phẳng nền trắng `#FFFFFF`, zero hover, không blur, không bo góc quá 1px, chỉ Light Mode, không AI, font Segoe UI tiếng Việt).
    - [x] Hỗ trợ luồng tải mượt mà (Downloading -> Verifying SHA-256 -> Extracting -> Installed) hiển thị phần trăm `%`, dung lượng và `MB/s`.
    - [x] Tự động đăng ký và gỡ bỏ từng ứng dụng riêng biệt vào Windows Control Panel (`appwiz.cpl`) hai chiều đồng bộ thời gian thực.
    - [x] Đã biên dịch ra tệp thực thi [**`nomr/target/debug/nom-launcher.exe`**](file:///E:/DATA/source/Nom/nomr/target/debug/nom-launcher.exe) (~25.8 MB).
  * [x] **Giai đoạn 2: Writer / Docs Engine (Word Processor)**:
    - [x] Tạo `crates/document` (Mô hình Document AST thuần Rust: `Document`, `Paragraph`, `TextRun`, `RunStyle`, `Alignment`).
    - [x] Tạo `crates/docx` (Parser giải nén ZIP và tạo cấu trúc OpenXML DOCX chuẩn, vượt qua unit test roundtrip).
    - [x] Tạo `apps/writer` (Trình soạn thảo văn bản native với canvas A4 phẳng tối giản `#FFFFFF`, zero hover, mở và lưu `.docx`).
    - [x] Đã biên dịch ra tệp thực thi [**`nomr/target/debug/nom-writer.exe`**](file:///E:/DATA/source/Nom/nomr/target/debug/nom-writer.exe) (~21.2 MB).
  * [x] **Giai đoạn 3: Sheet / Spreadsheet Engine (Bảng tính & Công thức)**:
    - [x] Tạo `crates/workbook` (Mô hình `CellAddress`, `CellRange`, `CellValue`, `Sheet`, `Workbook`, xuất/nhập CSV).
    - [x] Tạo `crates/formula` (Pratt Parser & Engine tính toán công thức Excel, hỗ trợ `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `PRODUCT`, `IF`).
    - [x] Tạo `crates/xlsx` (Bộ nén và giải nén tệp `.xlsx` OpenXML chuẩn, vượt qua unit test roundtrip).
    - [x] Tạo `apps/sheet` (Ứng dụng bảng tính desktop native lưới tính 2D phẳng tối giản `#FFFFFF`, zero hover, formula bar, mở/lưu `.xlsx`).
    - [x] Đã biên dịch ra tệp thực thi [**`nomr/target/debug/nom-sheet.exe`**](file:///E:/DATA/source/Nom/nomr/target/debug/nom-sheet.exe) (~21.5 MB).
  * [x] **Giai đoạn 4: Slide / Presentation Engine (Bản trình chiếu & Vector)**:
    - [x] Tạo `crates/graphics` (Mô hình hình học `Point`, `Rect`, `Size`, `Transform`, quản lý màu sắc `Color`).
    - [x] Tạo `crates/presentation` (Mô hình `Shape`, `Slide`, `Presentation` tỉ lệ chuẩn 16:9).
    - [x] Tạo `crates/pptx` (Bộ đọc & ghi OpenXML PPTX chuẩn nén ZIP, vượt qua unit test roundtrip).
    - [x] Tạo `apps/slide` (Ứng dụng trình chiếu desktop native canvas vector 16:9 phẳng tối giản `#FFFFFF`, zero hover, tương tác kéo thả hình khối, chế độ trình chiếu fullscreen, mở/lưu `.pptx`).
    - [x] Đã biên dịch ra tệp thực thi [**`nomr/target/debug/nom-slide.exe`**](file:///E:/DATA/source/Nom/nomr/target/debug/nom-slide.exe) (~21.3 MB).
  * [x] **Giai đoạn 5: PDF Reader & Digital Signature Core (Đọc & Ký số PDF)**:
    - [x] Tạo `crates/pdf` (Trình phân tích cú pháp PDF nhị phân, giải mã FlateDecode zlib, XRef table, bộ ký số xác thực toàn vẹn SHA-256).
    - [x] Tạo `apps/pdf` (Ứng dụng đọc PDF đa trang native phẳng tối giản `#FFFFFF`, zero hover, điều hướng trang, zoom, ký số điện tử và xuất PDF).
    - [x] Đã biên dịch ra tệp thực thi [**`nomr/target/debug/nom-pdf.exe`**](file:///E:/DATA/source/Nom/nomr/target/debug/nom-pdf.exe) (~20.5 MB).
  * [x] **Giai đoạn 6: Markdown & HTML Editor (Soạn thảo Markdown và HTML)**:
    - [x] Tạo `crates/markdown` (Bộ phân tích cú pháp CommonMark, mở rộng GFM table, chuyển đổi xuất HTML).
    - [x] Tạo `crates/html` (Cây DOM thuần Rust, parser bóc tách thẻ/thuộc tính/entities, pretty-print serializer).
    - [x] Tạo `apps/markdown` (Ứng dụng soạn thảo Split-View hai màn hình phẳng tối giản `#FFFFFF`, zero hover, đếm dòng/từ, render live preview trực quan, mở/lưu `.md`, xuất HTML).
    - [x] Đã biên dịch ra tệp thực thi [**`nomr/target/debug/nom-markdown.exe`**](file:///E:/DATA/source/Nom/nomr/target/debug/nom-markdown.exe) (~20.1 MB).
* **Giai đoạn hiện tại**: **GIAI ĐOẠN 7 — BROWSER CORE & NATIVE SANDBOX (ENGINE TRÌNH DUYỆT THUẦN RUST)**
* **Trạng thái chi tiết**: ⏳ **SẴN SÀNG TRIỂN KHAI GIAI ĐOẠN 7 — BƯỚC 7.1: DOM Traversal, CSS Selector Matching & Layout Box Engine**
* **Việc tiếp theo AI PHẢI làm ngay**:
  1. Kích hoạt `crates/dom`, `crates/css`, `crates/sandbox` và `apps/browser` trong [**`Cargo.toml`**](file:///E:/DATA/source/Nom/nomr/Cargo.toml) workspace.
  2. Xây dựng CSS parser rulesets, tính toán style cascade cho cây DOM.
  3. Xây dựng Layout Box Model (Content, padding, border, margin) và Renderer Painter.
  4. Xây dựng ứng dụng Nom Browser đa tab với Sandbox an toàn.
* **Tài liệu tham chiếu**:
  * Bản đồ lộ trình tổng thể: [**`MIGRATION_PLAN.md`**](file:///E:/DATA/source/Nom/nomr/MIGRATION_PLAN.md)
  * Kế hoạch kiến trúc: [**`implementation_plan.md`**](file:///C:/Users/sonng/.gemini/antigravity/brain/55153245-751d-47a1-872b-f86dc0f8e421/implementation_plan.md)
  * Đặc tả kỹ thuật Hub & Package: [**`docs/packaging.md`**](file:///E:/DATA/source/Nom/nomr/docs/packaging.md)
  * Đặc tả kỹ thuật Bộ lõi Office: [**`docs/office.md`**](file:///E:/DATA/source/Nom/nomr/docs/office.md)

---

## 🎨 QUY CHUẨN GIAO DIỆN BẮT BUỘC 100% (STRICT MINIMALIST UI/UX RULES)

> [!CAUTION]
> **Tuyệt đối tuân thủ các nguyên tắc thiết kế sau cho Office Hub và các ứng dụng Nom. Bất kỳ AI nào tạo hiệu ứng màu mè hay bo góc phức tạp đều bị coi là vi phạm yêu cầu:**

1. **Nền trắng tinh khiết (`#FFFFFF`)**:
   * Toàn bộ app đặt trực tiếp trên nền trắng tuyệt đối. Không dùng màu nền xám nhạt, không dùng gradient.
2. **Không có hiệu ứng khi di trỏ chuột (NO HOVER EFFECTS)**:
   * Khi con trỏ chuột lướt qua nút bấm hay danh sách app, **tuyệt đối không đổi màu, không sáng lên, không phóng to, không có chuyển động (transition/animation)**.
3. **Không làm mờ viền, không bóng đổ (NO BLUR / NO SHADOW / NO VIGNETTE)**:
   * Không có hiệu ứng kính mờ (Mica/Acrylic blur), không drop shadow viền, không glow.
4. **Không bo góc quá nhiều (FLAT / SHARP CORNERS)**:
   * Góc nút bấm và ô danh sách chỉ bo tối đa từ **0px đến 2px** (phẳng sắc cạnh, tối giản).
5. **Không lồng khung trong khung (NO NESTED FRAMES)**:
   * Không bọc thẻ lồng thẻ (card inside card). Danh sách ứng dụng được kẻ bằng đường phân cách mỏng trực tiếp trên nền trắng của app.
6. **Chỉ có giao diện sáng (LIGHT MODE ONLY)**:
   * Không hỗ trợ Dark Mode. Không tạo nút chuyển đổi giao diện sáng/tối.
7. **Không có AI trong Hub**:
   * Ứng dụng Hub chỉ làm nhiệm vụ thuần túy: Hiển thị ứng dụng, tải gói, kiểm tra checksum, cài đặt, tạo shortcut, mở và gỡ ứng dụng.

---

## 🚨 QUY TẮC GIT CỤC BỘ BẮT BUỘC (GIT WORKFLOW)

Mỗi khi AI hoàn thành một tính năng, code xong một module, fix xong bug, hoặc cập nhật tiến độ:
**BẮT BUỘC PHẢI CHẠY COMMIT LƯU LẠI VÀO GIT CỤC BỘ NGAY LẬP TỨC:**
```bash
git status
git add .
git commit -m "<type>(<scope>): <mô tả ngắn gọn>"
```
