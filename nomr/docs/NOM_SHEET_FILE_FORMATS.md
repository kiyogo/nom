# Nom Sheet — Đặc tả Định dạng Tệp

## 1. Định dạng Microsoft Excel (.xlsx)

Nom Sheet sử dụng tiêu chuẩn quốc tế **ECMA-376 OpenXML SpreadsheetML** để đọc và lưu trữ các tệp bảng tính `.xlsx`.

### Cấu trúc Gói OpenXML ZIP
Khi Nom Sheet lưu tệp `.xlsx`, một gói lưu trữ nén chuẩn ZIP được tạo ra chứa các tệp thành phần sau:
- `[Content_Types].xml`: Khai báo kiểu MIME cho các phần tử XML trong tài liệu.
- `_rels/.rels`: Khai báo quan hệ cấp cao nhất, trỏ tới `xl/workbook.xml`.
- `xl/workbook.xml`: Khai báo danh sách các trang tính (sheets) cùng ID và tên hiển thị tương ứng.
- `xl/_rels/workbook.xml.rels`: Khai báo liên kết từ workbook tới các sheet và tệp định dạng kiểu dáng `styles.xml`.
- `xl/styles.xml`: Định nghĩa hệ thống kiểu dáng chung:
  - `<fonts>`: Danh sách các phông chữ (bình thường, đậm, nghiêng).
  - `<fills>`: Danh sách màu nền ô (bao gồm các fill mặc định `none`, `gray125`, và các màu RGB tùy chọn).
  - `<borders>`: Cấu hình đường viền ô.
  - `<cellStyleXfs>` và `<cellXfs>`: Bảng ánh xạ thuộc tính kiểu dáng ô kết hợp (fontId, fillId, borderId, numFmtId, alignment).
- `xl/worksheets/sheet{N}.xml`: Nội dung dữ liệu tế bào của từng trang tính:
  - Tọa độ ô `<c r="A1" s="1" t="n">` (chỉ số kiểu `s`, kiểu dữ liệu `t`).
  - Giá trị tính toán `<v>12345</v>`.
  - Công thức tính toán `<f>SUM(A1:A10)</f>` (cho phép Excel tự động tính toán lại khi mở tệp).

### Phân tích và Phục hồi Kiểu dáng (Styles Parsing)
- Khi đọc tệp `.xlsx`:
  - `nom-xlsx` phân tích cú pháp `xl/styles.xml` để trích xuất danh sách font (kiểm tra `<b/>`, `<i/>`, màu `<color rgb="..."/>`), danh sách màu nền (`<patternFill><fgColor rgb="..."/>`), cấu hình căn lề (`<alignment horizontal="..."/>`) và mã định dạng số (`numFmtId`).
  - Khi đọc từng ô trong `sheet{N}.xml`, thuộc tính kiểu `s="index"` được tra cứu và gán vào cấu trúc `CellStyle` trong `Sheet`.
- Khi ghi tệp `.xlsx`:
  - `StyleRegistry` quét toàn bộ workbook, thu thập tập hợp các kiểu ô duy nhất và phát sinh bảng `xl/styles.xml` chuẩn OpenXML.

### Cơ chế Lưu an toàn (Atomic File Persistence)
Để ngăn ngừa tình trạng hư hỏng dữ liệu khi người dùng lưu đè tệp gốc:
1. Gói OpenXML mới được ghi vào một tệp tạm thời có tên dạng `.nom-temp-{timestamp}.tmp` cùng thư mục với tệp đích.
2. Kiểm tra tính toàn vẹn của tệp ZIP vừa nén.
3. Sử dụng `std::fs::rename` để đổi tên tệp tạm thời thành tệp đích một cách nguyên tử (atomic replace). Nếu có lỗi xảy ra ở bất kỳ giai đoạn nào, tệp gốc của người dùng được giữ nguyên 100%.

---

## 2. Định dạng Phân tách bằng Dấu phẩy (.csv)

- **Mã hóa**: 100% chuẩn UTF-8, hỗ trợ đầy đủ tiếng Việt có dấu và các ký tự Unicode quốc tế.
- **Dấu phân cách**: Dấu phẩy (`,`) theo chuẩn RFC 4180.
- **Xử lý Dữ liệu Chuỗi Phức tạp**:
  - Tự động bao bọc trường dữ liệu trong dấu ngoặc kép (`"..."`) nếu chứa dấu phẩy, dấu ngoặc kép hoặc ký tự xuống dòng (`\n`).
  - Dấu ngoặc kép bên trong chuỗi được nhân đôi (`""`) theo chuẩn escape của Excel và RFC 4180.
- **Xuất dữ liệu**: Xuất trang tính hiện tại với vùng dữ liệu hoạt động (used range), định dạng kết thúc dòng chuẩn `\r\n` (CRLF) trên Windows.

---

## 3. Định dạng Bảng nhớ tạm (.tsv)

- **Chuẩn trao đổi**: Tab-Separated Values (TSV).
- **Phân tách**: Các cột được phân tách bằng ký tự Tab (`\t`), các hàng được phân tách bằng ký tự xuống dòng (`\r\n`).
- **Tương thích Hệ thống**: Chuẩn TSV của Nom Sheet tương thích 100% với Clipboard của Windows, cho phép người dùng:
  - Sao chép một vùng ô trong Microsoft Excel hoặc Google Sheets và Dán trực tiếp vào Nom Sheet (giữ nguyên bố cục lưới).
  - Sao chép từ Nom Sheet và Dán trực tiếp vào Excel, Word, Google Docs hoặc Notepad.
