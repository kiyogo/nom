# Nom Sheet — Báo cáo Tiến độ Phát triển

## 1. Thành tựu Đã Hoàn thành Toàn diện

### A. Tầng Lõi Bảng tính & Mô hình Dữ liệu (`crates/workbook`)
- [x] Lưu trữ tế bào thưa (Sparse Cell Storage) bằng `BTreeMap<CellAddress, CellValue>`.
- [x] Hệ thống Kiểu dáng Ô (Cell Styling) `BTreeMap<CellAddress, CellStyle>` hỗ trợ in đậm, in nghiêng, màu chữ, màu nền, căn lề (Left, Center, Right), và định dạng số (General, Number, Currency ₫, Percentage %, Date).
- [x] Thao tác Cấu trúc: Chèn/Xóa hàng, Chèn/Xóa cột, Xóa nội dung vùng chọn (Clear Range).
- [x] Quản lý Đa Sheet: Thêm sheet, Đổi tên sheet, Xóa sheet, Tìm kiếm sheet theo tên.
- [x] Tương tác Bảng nhớ tạm (TSV Clipboard): Xuất và Nhập chuỗi TSV hai chiều tương thích hoàn hảo với Microsoft Excel, Google Sheets và Notepad.
- [x] Động cơ CSV chuẩn RFC 4180: Hỗ trợ tiếng Việt UTF-8, chuỗi trong ngoặc kép và ký tự xuống dòng.

### B. Động cơ Tính toán & Công thức (`crates/formula`)
- [x] Pratt Parser & Trình đánh giá biểu thức toán học với đầy đủ độ ưu tiên toán tử (`+`, `-`, `*`, `/`, `^`, `&`, so sánh `=, <>, <, >, <=, >=`).
- [x] Hơn 50 hàm Excel chuẩn:
  - Toán học: `SUM`, `SUMIF`, `PRODUCT`, `ABS`, `MOD`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `INT`, `TRUNC`, `CEILING`, `FLOOR`, `POWER`, `SQRT`, `EXP`, `LN`, `LOG`, `LOG10`, `SIN`, `COS`, `TAN`, `PI`, `RAND`, `RANDBETWEEN`.
  - Thống kê: `AVERAGE`, `AVERAGEIF`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `COUNTBLANK`, `COUNTIF`, `MEDIAN`, `LARGE`, `SMALL`.
  - Logic: `IF`, `IFS`, `AND`, `OR`, `NOT`, `XOR`, `IFERROR`, `IFNA`, `TRUE`, `FALSE`, `SWITCH` (đánh giá ngắn mạch).
  - Văn bản: `LEFT`, `RIGHT`, `MID`, `LEN`, `TRIM`, `UPPER`, `LOWER`, `PROPER`, `CONCAT`, `CONCATENATE`, `TEXTJOIN`, `EXACT`, `REPT`, `REPLACE`, `SUBSTITUTE`, `VALUE`, `TEXT`.
  - Ngày giờ: `TODAY`, `NOW`, `DATE`, `TIME`, `YEAR`, `MONTH`, `DAY`, `HOUR`, `MINUTE`, `SECOND`, `DAYS`.
  - Tra cứu: `VLOOKUP`, `HLOOKUP`, `INDEX`, `MATCH`, `CHOOSE`, `ROW`, `COLUMN`, `ROWS`, `COLUMNS`.
- [x] Hỗ trợ tiêu chí so sánh dạng chuỗi trong các hàm `SUMIF`, `COUNTIF` (ví dụ `">50"`, `"<=100"`).
- [x] Tham chiếu chéo giữa các sheet (`=Sheet1!A1*2`, `=SUM(Data!A1:A10)`).
- [x] Cơ chế phát hiện tham chiếu vòng lặp (Circular Reference Guard) và giới hạn đệ quy 500, trả về `#REF!`.

### C. Bộ Xử lý Định dạng OpenXML (.xlsx) (`crates/xlsx`)
- [x] Đọc và ghi tệp OpenXML SpreadsheetML chuẩn tương thích 100% Microsoft Excel.
- [x] Sinh động và phân tích cú pháp tệp `xl/styles.xml` để bảo toàn kiểu dáng ô (in đậm, in nghiêng, màu nền, căn lề, định dạng số).
- [x] Lưu trữ công thức tế bào trong thẻ `<f>` để Excel tự động tính toán lại khi mở file.
- [x] Bảo vệ chống tấn công Zip Bomb (giới hạn 64MB giải nén, 256 sheet, 1M ô/sheet).
- [x] Cơ chế ghi tệp tạm nguyên tử (Atomic save) chống mất mát dữ liệu gốc khi có sự cố.

### D. Giao diện Ứng dụng Desktop (`apps/sheet`)
- [x] Giao diện Ribbon chuẩn Windows 11 với 5 Tab: `Trang chủ`, `Chèn`, `Công thức`, `Dữ liệu`, `Xem`.
- [x] Formula Bar trực quan: Name Box (`A1` - cho phép gõ địa chỉ để nhảy nhanh), nút `fx`, và ô nhập công thức đồng bộ hai chiều.
- [x] Lưới tính ảo hóa mượt mà (Virtualized Grid) hiển thị viền xanh và Corner Fill Handle.
- [x] Thống kê vùng chọn theo thời gian thực (Count, Sum, Avg, Min, Max).
- [x] Động cơ Vẽ Biểu đồ Vector Tương tác (Interactive Vector Charts): Cột (Column), Thanh ngang (Bar), Đường (Line), Tròn (Pie) từ dữ liệu vùng chọn.
- [x] Tìm kiếm & Thay thế (Find & Replace - Ctrl+F) với chức năng thay thế tất cả.
- [x] Lịch sử Hoàn tác / Làm lại (Undo / Redo) 100 cấp độ.
- [x] Phím tắt bàn phím: Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Z, Ctrl+Y, Ctrl+F, Delete/Backspace, Enter, Tab, Escape.
- [x] Quản lý đa sheet ở thanh đáy (thêm, xóa, đổi tên).

### E. Tích hợp Hệ sinh thái Nom Office (`crates/package` & `apps/launcher`)
- [x] Cập nhật catalog với kích thước thực 9.6 MB của Nom Sheet.
- [x] Cài đặt từ tệp nhị phân release thực tế, xác thực PE MZ-header và SHA-256.
- [x] Đăng ký gỡ cài đặt Windows Control Panel (`appwiz.cpl`).
- [x] Khởi chạy trực tiếp `nom-sheet.exe` với cờ `DETACHED_PROCESS`.
- [x] Tạo shortcut Desktop và Start Menu.

---

## 2. Kết quả Kiểm thử & Đóng gói

- **Workspace Tests**: **34/34 bài kiểm tra tự động vượt qua (100% PASS)** trên toàn bộ workspace Rust.
- **Bản phát hành Release**: Đã biên dịch thành công `nom-sheet.exe` (~9.4 MB) và `nom-launcher.exe` (~9.3 MB) ở chế độ Release tối ưu hóa, đóng gói vào `dist/Nom/` và đồng bộ vào thư mục cài đặt `%LOCALAPPDATA%\NomOffice\Nom\data\sheet\`.
