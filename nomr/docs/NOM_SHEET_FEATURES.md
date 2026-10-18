# Nom Sheet — Ma trận Tính năng

Bảng theo dõi và ma trận tính năng hoàn thiện của Nom Sheet trong phiên bản hiện tại.

| Hạng mục | Trạng thái | Chi tiết triển khai |
|---|---|---|
| **Ứng dụng Desktop Native** | **Hoàn thành (100%)** | Ứng dụng Rust bản địa (eframe/egui), không phụ thuộc WebView/Electron; giao diện Segoe UI theo chuẩn Windows 11 Fluent; hỗ trợ mở file qua argv hoặc giao diện. |
| **Ribbon Toolbar Tabs** | **Hoàn thành (100%)** | 5 Tab chức năng: `Trang chủ`, `Chèn`, `Công thức`, `Dữ liệu`, `Xem` với các nút lệnh trực quan, nhãn tiếng Việt chuẩn mực. |
| **Thanh Công thức (Formula Bar)** | **Hoàn thành (100%)** | Name Box (ô hiện tại `A1`, cho phép nhảy nhanh tới ô bất kỳ khi nhập địa chỉ), biểu tượng `fx`, và thanh nhập công thức thời gian thực. |
| **Lưới Tính ảo hóa (Virtualized Grid)** | **Hoàn thành (100%)** | Tối ưu hóa cuộn với `ScrollArea::show_rows` cho 1,048,576 hàng; hỗ trợ 16,384 cột; làm nổi bật hàng/cột được chọn; viền xanh ô tích cực và núm kéo góc (Corner Fill Handle). |
| **Hệ thống Đa Sheet** | **Hoàn thành (100%)** | Thanh chuyển tab ở đáy cửa sổ; nút thêm Sheet mới; hộp thoại đổi tên sheet với kiểm tra trùng lặp; xóa sheet có cảnh báo bảo vệ sheet cuối cùng. |
| **Định dạng Ô (Cell Formatting)** | **Hoàn thành (100%)** | Chữ Đậm (Bold), Chữ Nghiêng (Italic), Căn lề Trái / Giữa / Phải, Màu chữ tùy biến, Màu nền ô tùy biến. |
| **Định dạng Số (Number Formatting)** | **Hoàn thành (100%)** | Định dạng Chung (General), Số chuẩn (Number), Tiền tệ (Currency với ký hiệu ₫), Phần trăm (Percentage), và Ngày tháng (Date theo chuẩn Excel). |
| **Thao tác Hàng & Cột** | **Hoàn thành (100%)** | Chèn hàng mới, Xóa hàng, Chèn cột mới, Xóa cột, Xóa nội dung vùng chọn (Clear Content). |
| **Sắp xếp Dữ liệu (Sorting)** | **Hoàn thành (100%)** | Sắp xếp vùng chọn từ A-Z (Tăng dần) và từ Z-A (Giảm dần). |
| **Tìm kiếm & Thay thế (Find & Replace)** | **Hoàn thành (100%)** | Hộp thoại Ctrl+F với chức năng tìm kiếm chuỗi trong sheet, chuyển nhanh tới ô khớp tiếp theo, thay thế từng ô và Thay thế tất cả (Replace All). |
| **Lịch sử Hoàn tác (Undo / Redo)** | **Hoàn thành (100%)** | Ngăn xếp 100 cấp độ lịch sử lưu trữ trạng thái trước và sau của các ô bị thay đổi (giá trị + định dạng). Phím tắt Ctrl+Z và Ctrl+Y. |
| **Bảng nhớ tạm (TSV Clipboard)** | **Hoàn thành (100%)** | Cắt (Ctrl+X), Sao chép (Ctrl+C), Dán (Ctrl+V) theo chuẩn Tab-Separated Values (TSV), tương thích 2 chiều hoàn hảo với Excel, Google Sheets và Notepad. |
| **Động cơ Công thức (Formula Engine)** | **Hoàn thành (100%)** | Hơn 50 hàm Excel bao gồm: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTBLANK, SUMIF, COUNTIF, AVERAGEIF, IF, IFS, IFERROR, IFNA, AND, OR, NOT, XOR, SWITCH, VLOOKUP, HLOOKUP, INDEX, MATCH, CHOOSE, ROW, COLUMN, ROWS, COLUMNS, LEFT, RIGHT, MID, LEN, TRIM, UPPER, LOWER, PROPER, CONCAT, CONCATENATE, TEXTJOIN, EXACT, REPT, REPLACE, SUBSTITUTE, VALUE, TEXT, TODAY, NOW, DATE, TIME, YEAR, MONTH, DAY, HOUR, MINUTE, SECOND, DAYS, ROUND, ROUNDUP, ROUNDDOWN, INT, TRUNC, CEILING, FLOOR, POWER, SQRT, MOD, ABS, EXP, LN, LOG, LOG10, SIN, COS, TAN, PI, RAND, RANDBETWEEN. |
| **Tham chiếu Đa Sheet** | **Hoàn thành (100%)** | Tham chiếu chéo giữa các sheet (ví dụ `=Sheet1!A1*2`, `=SUM(Data!A1:A10)`). Bảo vệ tham chiếu vòng lặp (Circular Reference Guard) trả về `#REF!`. |
| **Biểu đồ Vector Tương tác (Charts)** | **Hoàn thành (100%)** | Kết xuất đồ họa vector trực tiếp từ dữ liệu vùng chọn: Biểu đồ Cột (Column Chart), Biểu đồ Thanh ngang (Bar Chart), Biểu đồ Đường (Line Chart), Biểu đồ Tròn (Pie Chart) với bảng chú giải tỷ lệ phần trăm. |
| **Thống kê Vùng chọn (Status Bar)** | **Hoàn thành (100%)** | Tự động tính toán và hiển thị ở thanh trạng thái: Số ô đã chọn, Tổng cộng (Sum), Trung bình (Average), Giá trị nhỏ nhất (Min), Giá trị lớn nhất (Max). |
| **Tương thích File Excel (.xlsx)** | **Hoàn thành (100%)** | Đọc và ghi tệp OpenXML SpreadsheetML đầy đủ: bảo toàn giá trị, công thức (thẻ `<f>`), nhiều sheet, và đồng bộ kiểu dáng ô qua `xl/styles.xml`. Lưu an toàn bằng tệp tạm thời. |
| **Tương thích File CSV** | **Hoàn thành (100%)** | Đọc và ghi tệp CSV chuẩn UTF-8, hỗ trợ dấu phẩy, chuỗi trong ngoặc kép, ký tự xuống dòng trong ô và tiếng Việt có dấu. |
| **Tích hợp Software Hub** | **Hoàn thành (100%)** | Cài đặt gói thật từ nhị phân bản địa, xác thực PE & SHA-256, đăng ký Windows Control Panel, tạo shortcut Desktop/Start Menu, khởi chạy tiến trình riêng biệt không làm gián đoạn Hub. |
