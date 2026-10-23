# Nom Sheet — Tính năng hiện có và giới hạn

Tài liệu này mô tả phần đã triển khai trong mã nguồn Rust hiện tại của `apps/sheet`, `crates/workbook`, `crates/formula` và `crates/xlsx`. Đây là phạm vi chức năng của ứng dụng desktop cục bộ, không phải chứng nhận tương thích đầy đủ với Google Sheets hay Excel.

Định hướng sản phẩm là ribbon kiểu Docs kết hợp lưới kiểu Google Sheets. Yêu cầu có toàn bộ tính năng Google Sheets là mục tiêu phát triển; các tính năng còn thiếu bên dưới chưa được hoàn thành. Hình thức giao diện tương tự không đồng nghĩa với cùng chức năng hoặc cùng kết quả xử lý tệp và công thức.

## Tính năng đã triển khai

| Hạng mục | Phạm vi hiện có | Giới hạn cần biết |
|---|---|---|
| Ứng dụng native | Rust với `eframe` / `egui`, backend `wgpu`; mở tệp qua đối số dòng lệnh hoặc giao diện. Giao diện sáng, nhãn tiếng Việt. | Không có dịch vụ cộng tác hay lưu trữ đám mây trong ứng dụng bảng tính. |
| Ribbon kiểu Docs | Thanh tiêu đề tài liệu, trạng thái chưa lưu, lưu nhanh, undo/redo, tìm kiếm; 8 tab: `Tệp`, `Trang chủ`, `Chèn`, `Định dạng`, `Dữ liệu`, `Công thức`, `Xem`, `Trợ giúp`. Ribbon cuộn ngang khi thiếu chỗ. | `Định dạng` dùng chung nhóm lệnh với `Trang chủ`; `Trợ giúp` hiển thị hướng dẫn và danh sách khả năng. Tên tab không cam kết đủ tính năng tương ứng của Google Sheets. |
| Mở / lưu tệp | Tạo mới, mở, lưu, tải `.xlsx` và xuất CSV; hộp thoại tệp native trên Windows. Tab Tệp dùng cùng bộ SVG với mẫu Docs; có cửa sổ xem/sao chép nguồn CSV. | Bộ chọn tệp ngoài Windows hiện trả về `None`; tên lệnh dành cho Sheet, không dùng định dạng tài liệu `.wnom`. |
| Bản in | Dựng bảng HTML cục bộ từ các giá trị đã tính và mở trình duyệt; nút In bảng tính dùng hộp thoại in/lưu PDF của trình duyệt. | Giới hạn 100.000 ô, chưa có phân trang/vùng in hoặc giữ toàn bộ style, không phải xuất PDF native. |
| Thanh công thức | Name Box nhận địa chỉ ô hoặc vùng, ví dụ `A1`, `A1:C10`; biểu tượng `fx`; nhập giá trị hoặc công thức và xác nhận bằng Enter. | Chưa có trình biên tập công thức với đầy đủ gợi ý, tô màu tham chiếu và trợ giúp đối số như Google Sheets. |
| Lưới kiểu Google Sheets | Vẽ trực tiếp phần nhìn thấy bằng `egui::Painter` trong `ScrollArea::both().show_viewport`; cuộn hai chiều, tiêu đề hàng/cột cố định tại mép viewport, vùng chọn và ô hiện hành màu xanh dương `#1A73E8`. | Tiêu đề cố định không phải chức năng đóng băng các hàng/cột dữ liệu tùy chọn. Chấm ở góc ô chỉ là dấu vẽ; chưa có kéo điền tự động. |
| Chọn và sửa ô | Click, kéo chọn, Shift-click, Shift-phím mũi tên, chọn cả hàng/cột từ tiêu đề; sửa tại ô bằng nhấp đúp, F2 hoặc Enter; Enter/Tab xác nhận và chuyển ô, Escape hủy sửa. Menu ngữ cảnh có sao chép, dán, xóa. | Mô hình địa chỉ có tối đa 1.048.576 hàng × 16.384 cột; đây không phải cam kết tải hay thao tác toàn bộ số ô đó cùng lúc. |
| Phông chữ và trang trí | `CellStyle` lưu `font_size: u16` mặc định 10 pt, `font_family: String` mặc định `Arial`, `bold`, `italic`, `underline`, `strikethrough`. Ribbon chọn Arial, Segoe UI, Times New Roman, Calibri; cỡ chữ 6–96 pt. | Renderer dùng các font Windows khi có, kèm fallback của egui. Tên font khác vẫn lưu trong mô hình/XLSX nhưng hiển thị bằng Arial; cỡ chữ phân số trong XLSX được làm tròn về số nguyên pt. |
| Màu và căn lề | Màu chữ/nền RGB trong mô hình; ribbon cung cấp bảng màu định sẵn; căn trái, giữa, phải và căn tự động theo kiểu giá trị. | Chưa có bộ định dạng đầy đủ cho viền ô, xuống dòng, xoay chữ, căn dọc hay kích thước hàng/cột tùy chỉnh. |
| Định dạng số | `General`, `Number`, `Currency`, `Percentage`, `Date`; hiển thị số/phần trăm với hai chữ số thập phân, tiền tệ với `$`, ngày theo serial Excel. | Không có hệ thống định dạng tùy chỉnh hay tiền tệ/locale đầy đủ; không cam kết giữ nguyên mọi mã định dạng XLSX. |
| Nhiều trang tính | Chuyển tab, thêm sheet với tên duy nhất, nhấp đúp tab để đổi tên. Mô hình kiểm tra tên trùng. | `Workbook::delete_sheet` có bảo vệ sheet cuối cùng nhưng ribbon/tab hiện chưa cung cấp lệnh xóa sheet; lỗi đổi tên chưa được trình bày đầy đủ trong hộp thoại. |
| Hàng, cột và xóa vùng | Tab `Dữ liệu` chèn/xóa hàng hoặc cột tại ô hiện hành; xóa vùng chọn loại bỏ cả giá trị và định dạng. | Thao tác cấu trúc chưa có undo/redo; chèn/xóa không viết lại tham chiếu trong chuỗi công thức. |
| Sắp xếp | Tăng/giảm theo cột của ô hiện hành trong vùng chọn; di chuyển giá trị cùng style theo hàng. | Một khóa sắp xếp; dùng giá trị thô, không đánh giá công thức làm khóa; chưa có bộ lọc hay chế độ xem bộ lọc. |
| Tìm và thay thế | Ctrl+F, tìm tiếp có quay vòng trong sheet hiện hành; thay ô hiện tại hoặc thay tất cả. | Tìm kiếm không phân biệt hoa/thường; phép thay chuỗi có phân biệt hoa/thường. Chưa có regex hay tìm trên toàn workbook. |
| Undo / redo cho ô | Tối đa 100 mục undo; lưu giá trị và style trước/sau cho sửa ô, định dạng, cắt/dán, xóa vùng, sắp xếp và thay thế. Ctrl+Z / Ctrl+Y. | Không bao phủ chèn/xóa hàng/cột, thêm/đổi tên/xóa sheet hoặc mọi thao tác giao diện. Lịch sử không tái ánh xạ theo thay đổi cấu trúc. |
| Clipboard TSV | Sao chép/cắt dưới dạng văn bản TSV; dán sự kiện clipboard, đọc clipboard bằng `arboard` từ ribbon/menu và có bộ đệm văn bản nội bộ. | Chỉ trao đổi văn bản/giá trị, không mang style hay đối tượng. TSV hiện tách dòng/tab đơn giản, không bảo toàn tab hoặc xuống dòng nằm trong ô. |
| Công thức | Parser và evaluator Rust riêng; toán tử số học, so sánh, nối chuỗi, tham chiếu ô/vùng và liên sheet; các nhóm hàm toán, thống kê, logic, văn bản, ngày giờ, tra cứu. | Chỉ một tập con; ngữ nghĩa/đối số không được bảo đảm giống toàn bộ Google Sheets/Excel. Hàm không nhận diện trả `#NAME?`. |
| Biểu đồ | Một panel vẽ cột, thanh ngang, đường hoặc tròn từ vùng chọn bằng Painter; lấy nhãn ở cột đầu, một chuỗi số ở cột cuối. | Trạng thái biểu đồ chỉ ở UI, không lưu/đọc biểu đồ XLSX; dữ liệu công thức chưa được tính để vẽ; chưa có trình sửa biểu đồ đầy đủ. |
| Thanh trạng thái và xem | Hiển thị trạng thái thao tác, zoom 50–200%, ẩn/hiện đường lưới; vùng nhiều ô hiển thị số ô có dữ liệu, tổng và trung bình. | Thống kê dùng dữ liệu thô, chưa tính kết quả công thức; helper có tính min/max nhưng thanh trạng thái chưa hiển thị hai giá trị này. |
| XLSX | Đọc/ghi nhiều sheet, giá trị, công thức và các trường `CellStyle` được hỗ trợ, kể cả style trên ô trống. Lưu qua tệp tạm cạnh đích rồi đổi tên. | Không bảo toàn mọi thành phần OpenXML; xem phạm vi bên dưới. Không có bảo đảm an toàn tuyệt đối khi mất điện hay tương thích đầy đủ với các ứng dụng khác. |
| CSV UTF-8 | Đọc/ghi dấu phẩy, dấu ngoặc kép được escape và xuống dòng trong trường; lưu sheet hiện hành. | Không lưu nhiều sheet, style hay biểu đồ. Công thức xuất thành chuỗi có `=`, không phải kết quả tính. |

## Phạm vi công thức và thao tác lớn

Ví dụ đã có nhánh xử lý trong [`crates/formula/src/lib.rs`](../crates/formula/src/lib.rs): `SUM`, `AVERAGE`, `COUNT`, `SUMIF`, `COUNTIF`, `IF`, `IFS`, `IFERROR`, `VLOOKUP`, `INDEX`, `MATCH`, `LEFT`, `TEXTJOIN`, `DATE`, `NOW`, `ROUND`. Đây là các ví dụ của tập con đã cài đặt, không phải danh mục toàn bộ hàm Google Sheets hoặc cam kết tương thích ngữ nghĩa.

Tham chiếu liên sheet như `=Sheet1!A1*2` và `=SUM(Data!A1:A10)` được giải quyết bởi context ở ứng dụng. Phát hiện vòng lặp trả `#REF!`; chạm giới hạn độ sâu 500 hoặc phạm vi công thức trên 100.000 ô trả `#NUM!`. Chưa có đồ thị phụ thuộc và cache tính lại tăng dần; các ô công thức được đánh giá khi cần hiển thị.

Sao chép, cắt, định dạng, xóa vùng và sắp xếp hiện chặn vùng trên 100.000 ô. Các giới hạn này độc lập với kích thước địa chỉ worksheet và không phải giới hạn chung cho mọi đường xử lý.

## Phạm vi bảo toàn XLSX

Các trường đã được đưa vào đọc/ghi là cỡ/tên font, đậm, nghiêng, gạch chân, gạch ngang, màu chữ/nền RGB, căn ngang và các nhóm định dạng số của mô hình. Công thức được lưu trong `<f>`; tệp yêu cầu ứng dụng đọc tính lại, không có cache kết quả đầy đủ. Font không có trên máy có thể hiển thị khác dù tên font vẫn được lưu.

Loader không giữ nguyên gói XLSX gốc. Khi lưu lại, writer dựng gói mới từ `Workbook`; các phần chưa được mô hình hóa như biểu đồ, pivot, bộ lọc, gộp ô, xác thực dữ liệu, định dạng có điều kiện, macro, liên kết ngoài và metadata không được bảo đảm giữ lại. `preservation_warnings` hiện được thêm khi mở XLSX; ứng dụng yêu cầu xác nhận trước khi lưu lại XLSX đó, hoặc khi xuất workbook nhiều sheet thành CSV. Đây không phải cơ chế phát hiện đầy đủ từng tính năng bị mất.

## Chưa triển khai so với mục tiêu Google Sheets

| Nhóm | Phần còn thiếu |
|---|---|
| Trực tuyến và cộng tác | Đồng biên tập thời gian thực, con trỏ người dùng khác, chia sẻ/phân quyền, bình luận, lịch sử phiên bản và đồng bộ Google Drive. |
| Tự động hóa và dữ liệu ngoài | Apps Script, tiện ích mở rộng, connector và các dịch vụ/hàm phụ thuộc Google hoặc dữ liệu trực tuyến. |
| Phân tích và quy tắc dữ liệu | Pivot table, bộ lọc và filter view, xác thực dữ liệu/dropdown, định dạng có điều kiện. |
| Bố cục bảng tính | Gộp ô, đóng băng hàng/cột dữ liệu tùy chọn, đổi kích thước/ẩn hàng cột, xuống dòng và viền ô đầy đủ, kéo điền chuỗi và tự điều chỉnh tham chiếu công thức. |
| In và xuất bản | Thiết lập trang in/vùng in, phân trang, giữ style đầy đủ và xuất PDF native; bản in HTML cơ bản đã có. |
| Tính toán và khả năng tương tác | Toàn bộ thư viện/ngữ nghĩa hàm Google Sheets, mảng động đầy đủ, tính lại theo đồ thị phụ thuộc và bảo toàn mọi thành phần XLSX. |
| Lịch sử và quản lý đối tượng | Undo/redo cấu trúc, quản lý sheet đầy đủ qua UI, lưu và chỉnh sửa biểu đồ/đối tượng nâng cao. |

Chi tiết phân chia module và luồng dữ liệu: [Kiến trúc Nom Sheet](NOM_SHEET_ARCHITECTURE.md).
