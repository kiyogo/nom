# Nom Sheet — Kiến trúc Hệ thống

## 1. Tổng quan Kiến trúc

Nom Sheet là ứng dụng bảng tính bản địa (native desktop) hiệu năng cao, được phát triển hoàn toàn bằng ngôn ngữ **Rust** và xây dựng trên cùng kiến trúc đồ họa **eframe / egui** của hệ sinh thái **Nom Office**. Ứng dụng tích hợp liền mạch với **Nom Software Hub** (`apps/launcher` và `crates/package`), sử dụng chung hệ thống quản lý cài đặt, đăng ký Windows Control Panel và quy chuẩn thiết kế giao diện Windows 11 Fluent.

```text
                               ┌───────────────────────────┐
                               │     Nom Software Hub      │
                               │      (apps/launcher)      │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │   Nom Package Manager     │
                               │     (crates/package)      │
                               │ ├─ Catalog & AppInfo      │
                               │ ├─ PE / SHA-256 Verifier  │
                               │ ├─ Windows Registry / CPL │
                               │ └─ Process Launcher       │
                               └─────────────┬─────────────┘
                                             │ Khởi chạy độc lập
                                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Nom Sheet (apps/sheet)                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ UI & Rendering Layer (eframe / egui)                              │  │
│  │ ├─ Ribbon Toolbar (Trang chủ, Chèn, Công thức, Dữ liệu, Xem)     │  │
│  │ ├─ Formula Bar (Name Box A1, fx indicator, Formula Editor)       │  │
│  │ ├─ Virtualized Grid (Row/Col Virtualization, Selection, Handles) │  │
│  │ ├─ Live Vector Chart Engine (Column, Bar, Line, Pie)             │  │
│  │ ├─ Modal Dialogs (Find & Replace, Sheet Rename, Format Loss)     │  │
│  │ └─ Status Bar (Selection Statistics: Count, Sum, Avg, Min, Max)  │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    │                                   │
│  ┌─────────────────────────┬───────┴─────────────────┬──────────────┐  │
│  │    crates/workbook      │     crates/formula      │ crates/xlsx  │  │
│  │ ├─ Workbook & Sheets    │ ├─ Pratt Formula Parser │ ├─ OpenXML   │  │
│  │ ├─ Sparse Cell Storage  │ ├─ 50+ Excel Functions  │ ├─ Dynamic   │  │
│  │ ├─ Styles & Formatting  │ ├─ Cross-Sheet Eval     │ │  styles.xml│  │
│  │ ├─ Row/Col Operations   │ ├─ Short-Circuit Logic  │ ├─ Zip Stream│  │
│  │ ├─ TSV Clipboard I/O    │ └─ Circular Guard       │ └─ Safe Zip  │  │
│  │ └─ CSV Engine           │                         │              │  │
│  └─────────────────────────┴─────────────────────────┴──────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Các Tầng Logic Chi tiết

### Tầng 1 — Application & UI Layer (`apps/sheet`)
- **Lifecycle & Quản lý Cửa sổ**: Chạy với `windows_subsystem = "windows"` ở chế độ Release, hỗ trợ mở file trực tiếp qua tham số dòng lệnh `argv[1]` hoặc giao diện chọn file.
- **Ribbon Toolbar Tabs**:
  - `Trang chủ`: Cắt, Sao chép, Dán (TSV tương thích Excel), Hoàn tác (Undo), Làm lại (Redo), Định dạng Chữ (Đậm, Nghiêng), Căn lề (Trái, Giữa, Phải), Định dạng Số (Số nguyên/thực, Tiền tệ ₫, Phần trăm %, Ngày tháng), Thao tác Hàng/Cột (Chèn/Xóa hàng & cột, Xóa nội dung), Sắp xếp dữ liệu (A-Z, Z-A), Tìm kiếm & Thay thế (Ctrl+F).
  - `Chèn`: Thêm Biểu đồ Cột (Column), Biểu đồ Thanh ngang (Bar), Biểu đồ Đường xu hướng (Line), Biểu đồ Tròn phân bổ (Pie).
  - `Công thức`: Tóm tắt các nhóm hàm toán học, thống kê, logic, văn bản, ngày giờ và tra cứu.
  - `Dữ liệu`: Thao tác sắp xếp và quản lý vùng dữ liệu.
  - `Xem`: Phóng to (Zoom In), Thu nhỏ (Zoom Out), Đặt lại 100%, Ẩn/Hiện đường lưới bảng tính (Gridlines).
- **Hệ thống Lưới cuộn Ảo (Virtualized Grid)**:
  - Chỉ khởi tạo và kết xuất các hàng/cột nằm trong viewport hiển thị thông qua `ScrollArea::show_rows`.
  - Hỗ trợ tối đa 1,048,576 hàng và 16,384 cột (chuẩn Microsoft Excel XFD).
  - Hiển thị viền xanh và núm kéo góc (Corner Fill Handle) cho ô đang chọn.
  - Kéo thả chuột hoặc Shift-Click để chọn vùng dữ liệu nhiều ô.
- **Thanh trạng thái Thời gian thực (Status Bar)**: Tự động tính toán các thông số thống kê của vùng chọn: Tổng số ô, Tổng giá trị (Sum), Giá trị trung bình (Average), Giá trị nhỏ nhất (Min), Giá trị lớn nhất (Max).
- **Hệ thống Quản lý Đa Sheet (Multi-Sheet Tabs)**:
  - Thanh tab sheet ở đáy cửa sổ cho phép chuyển đổi sheet tức thì.
  - Nút thêm Sheet mới tự động sinh tên duy nhất.
  - Nhấp đúp chuột hoặc dùng menu để đổi tên sheet (có kiểm tra trùng lặp).
  - Xóa sheet có xác nhận bảo vệ sheet cuối cùng.

---

### Tầng 2 — Workbook Layer (`crates/workbook`)
- **Lưu trữ Thưa (Sparse Storage)**:
  - Tế bào ô được lưu trong `BTreeMap<CellAddress, CellValue>` và định dạng trong `BTreeMap<CellAddress, CellStyle>`.
  - Không cấp phát trước hàng triệu ô trống, đảm bảo kích thước RAM cực nhỏ ngay cả trên bảng tính lớn.
- **Hệ thống Kiểu dáng & Định dạng (Cell Styles)**:
  - `CellStyle`: hỗ trợ `bold`, `italic`, màu chữ `text_color: Option<[u8; 3]>`, màu nền `bg_color: Option<[u8; 3]>`, căn lề `CellAlign` (General, Left, Center, Right), và định dạng số `NumFormat` (General, Number, Currency, Percentage, Date).
- **Thao tác Cấu trúc Bảng**:
  - `insert_row`, `delete_row`: Dịch chuyển chỉ số hàng của các ô và style tương ứng.
  - `insert_column`, `delete_column`: Dịch chuyển chỉ số cột.
  - `clear_range`: Xóa dữ liệu và định dạng trong vùng chọn.
- **Clipboard TSV Interoperability**:
  - `export_tsv`: Xuất vùng chọn sang chuỗi Tab-Separated Values theo chuẩn Clipboard Windows.
  - `import_tsv`: Đọc nội dung TSV từ Clipboard hệ thống và ghi vào workbook bắt đầu từ ô được chọn.

---

### Tầng 3 — Formula Calculation Engine (`crates/formula`)
- **Pratt Parser & Trình đánh giá Động**:
  - Phân tích cú pháp biểu thức toán học với đầy đủ độ ưu tiên toán tử: số học (`+`, `-`, `*`, `/`, `^`), so sánh (`=`, `<>`, `<`, `>`, `<=`, `>=`), nối chuỗi (`&`), và toán tử đảo dấu âm.
- **Thư viện hơn 50 Hàm Chuẩn Excel**:
  - *Toán học & Lượng giác*: `SUM`, `SUMIF`, `PRODUCT`, `ABS`, `MOD`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `INT`, `TRUNC`, `CEILING`, `FLOOR`, `POWER`, `SQRT`, `EXP`, `LN`, `LOG`, `LOG10`, `SIN`, `COS`, `TAN`, `PI`, `RAND`, `RANDBETWEEN`.
  - *Thống kê*: `AVERAGE`, `AVERAGEIF`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `COUNTBLANK`, `COUNTIF`, `MEDIAN`, `LARGE`, `SMALL`.
  - *Logic*: `IF`, `IFS`, `AND`, `OR`, `NOT`, `XOR`, `IFERROR`, `IFNA`, `TRUE`, `FALSE`, `SWITCH` (hỗ trợ đánh giá ngắn mạch / short-circuit evaluation).
  - *Văn bản*: `LEFT`, `RIGHT`, `MID`, `LEN`, `TRIM`, `UPPER`, `LOWER`, `PROPER`, `CONCAT`, `CONCATENATE`, `TEXTJOIN`, `EXACT`, `REPT`, `REPLACE`, `SUBSTITUTE`, `VALUE`, `TEXT`.
  - *Ngày & Giờ*: `TODAY`, `NOW`, `DATE`, `TIME`, `YEAR`, `MONTH`, `DAY`, `HOUR`, `MINUTE`, `SECOND`, `DAYS`.
  - *Tra cứu & Tham chiếu*: `VLOOKUP`, `HLOOKUP`, `INDEX`, `MATCH`, `CHOOSE`, `ROW`, `COLUMN`, `ROWS`, `COLUMNS`.
- **Tham chiếu Đa Sheet & Bảo vệ Tham chiếu Vòng**:
  - Hỗ trợ tham chiếu giữa các trang tính: `=Sheet1!A1*2`, `=SUM(Data!B2:B10)`.
  - Ngăn chặn vòng lặp vô hạn (Circular Reference) bằng `HashSet<(sheet_idx, CellAddress)>` và giới hạn độ sâu đệ quy 500, trả về mã lỗi `#REF!` khi phát hiện vòng lặp.

---

### Tầng 4 — File Format Engine (`crates/xlsx`)
- **Đọc & Ghi Gói OpenXML (.xlsx)**:
  - Đọc và ghi các tệp OpenXML SpreadsheetML chuẩn tương thích 100% Microsoft Excel, Google Sheets và LibreOffice Calc.
  - Quản lý cấu trúc ZIP OpenXML: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/styles.xml`, và các `xl/worksheets/sheet{N}.xml`.
- **Sinh động Style Registry OpenXML**:
  - Tự động thu thập tất cả kiểu dáng ô trong workbook và phát sinh tệp `xl/styles.xml` chuẩn với `<fonts>`, `<fills>`, `<cellXfs>` và gán thuộc tính `s="..."` cho từng ô `<c>`.
  - Khi đọc file `.xlsx`, tự động phân tích `xl/styles.xml` để phục hồi lại định dạng font, màu nền, căn lề và định dạng số.
- **An toàn Tài nguyên & Anti-Zip-Bomb**:
  - Giới hạn kích thước giải nén XML tối đa 64 MiB cho mỗi thành phần.
  - Giới hạn tối đa 256 sheet và 1,000,000 ô trên mỗi sheet.
  - Sử dụng cơ chế ghi tệp tạm thời (atomic temporary file) cạnh file đích trước khi đổi tên (rename) để đảm bảo an toàn tuyệt đối cho dữ liệu gốc khi có sự cố mất điện/tắt ngang.

---

### Tầng 5 — Tích hợp Hệ sinh thái Nom Office (`crates/package`)
- **Đăng ký Ứng dụng trong Catalog**:
  - Nom Sheet được đăng ký với ID `sheet`, Danh mục `Office`, Icon `S` màu xanh lá, kích thước gói release thật `9.6 MB`, và tên tệp thực thi `nom-sheet.exe`.
- **Quy trình Cài đặt Thực sự (Local Installation)**:
  - Tự động tìm kiếm file nhị phân `nom-sheet.exe` trong gói phát hành `dist/Nom/` hoặc thư mục build `target/release/`.
  - Xác thực chữ ký PE (MZ header) và tính mã băm SHA-256 để chống can thiệp tệp.
  - Sao chép vào thư mục cài đặt chuẩn `%LOCALAPPDATA%\NomOffice\Nom\data\sheet\`.
  - Tạo script khởi chạy thông minh `sheet.cmd` và script gỡ cài đặt `uninstall.cmd`.
  - Tạo biểu tượng lối tắt (Shortcuts) trên Desktop và Start Menu.
  - Đăng ký thông tin ứng dụng đầy đủ với Windows Control Panel (`appwiz.cpl`).
- **Khởi chạy Tiến trình Độc lập**:
  - `launch_app` ưu tiên kiểm tra sự tồn tại của `nom-sheet.exe` thật và khởi chạy với cờ tiến trình ngầm `DETACHED_PROCESS` của Windows, cho phép Nom Sheet hoạt động mượt mà độc lập với Software Hub.
