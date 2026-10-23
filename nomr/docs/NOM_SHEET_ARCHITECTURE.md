# Nom Sheet — Kiến trúc Rust native hiện tại

Nom Sheet là ứng dụng bảng tính cục bộ viết bằng Rust, dùng `eframe` / `egui` với backend `wgpu`. Giao diện hướng tới ribbon kiểu Docs và lưới kiểu Google Sheets; đây là định hướng tương tác, không phải cam kết tương thích toàn bộ tính năng hoặc định dạng của Google Sheets/Excel. Phạm vi đã có và phần còn thiếu được theo dõi trong [ma trận tính năng](NOM_SHEET_FEATURES.md).

## Ranh giới module và crate

Các đường dẫn dưới đây tính từ thư mục `nomr/`:

```text
apps/launcher -> crates/package -> khởi chạy tiến trình nom-sheet

apps/sheet/src/main.rs                 eframe, cửa sổ native, argv[1]
└── app.rs / NomSheetApp               trạng thái UI, lệnh, undo, context công thức
    ├── app/appearance.rs              theme sáng, màu, đăng ký font và fallback
    ├── app/icons.rs                   icon vẽ bằng egui::Painter, nút và tooltip
    ├── app/chrome.rs                  tọa độ header/tab/File, formula bar, sheet tabs, resize cửa sổ
    ├── app/chrome_icons.rs            SVG Lucide từ mẫu Docs; cache theo kích thước/DPI
    ├── app/ribbon.rs                  nhóm lệnh định dạng, dữ liệu, biểu đồ, trợ giúp
    ├── app/file_commands.rs           nguồn CSV và bản in HTML cục bộ
    ├── app/capture.rs                 ảnh GPU của viewport cho kiểm tra bố cục
    ├── app/grid.rs                    viewport, vẽ ô/tiêu đề, cuộn, chọn và sửa tại ô
    └── app/dialogs.rs                 hộp thoại tệp Windows, đọc clipboard bằng arboard

apps/sheet -> crates/workbook          mô hình dữ liệu, style, CSV/TSV, thao tác cấu trúc
apps/sheet -> crates/formula           parser và evaluator qua FormulaContext
apps/sheet -> crates/xlsx              đọc/ghi gói OpenXML từ/ra Workbook
crates/formula, crates/xlsx -> crates/workbook
```

Ba engine `workbook`, `formula`, `xlsx` vẫn là các crate riêng, không phụ thuộc renderer egui. Ứng dụng nối chúng lại bằng lệnh giao diện và `WorkbookContext`; module UI không thay thế các engine. Hub/package phụ trách cài đặt và khởi chạy, không nằm trên đường vẽ ô hay tính toán công thức.

## Lớp ứng dụng và giao diện

[`main.rs`](../apps/sheet/src/main.rs) đọc đường dẫn ban đầu từ đối số dòng lệnh, tạo cửa sổ `eframe` và `NomSheetApp`. [`app.rs`](../apps/sheet/src/app.rs) giữ workbook, ô/vùng chọn, bộ đệm sửa ô/công thức/đường dẫn, tab đang mở, offset cuộn, zoom, lịch sử ô và biểu đồ hiện hành. `eframe::App::update` xử lý bàn phím, vẽ chrome/formula bar/thanh đáy rồi panel biểu đồ và lưới; các cửa sổ egui cho đổi tên sheet, tìm/thay thế, thay đổi chưa lưu và xác nhận phạm vi lưu hiện vẫn ở `app.rs`.

[`chrome.rs`](../apps/sheet/src/app/chrome.rs) định vị header, 8 tab, lệnh Tệp, formula bar và thanh trang tính bằng kích thước đo từ ảnh tham chiếu. Cửa sổ không dùng titlebar OS; module cung cấp kéo/phóng to/thu nhỏ/đóng và vùng resize. [`ribbon.rs`](../apps/sheet/src/app/ribbon.rs) giữ các nhóm lệnh của những tab khác. `Trang chủ` và `Định dạng` dùng chung nhóm clipboard/định dạng. `Dữ liệu` có sắp xếp và chèn/xóa hàng/cột; `Công thức` chèn mẫu hàm. Tên/lệnh vẫn dành cho Sheet theo lựa chọn người dùng.

Name Box phân tích `CellRange`, chuyển đến ô hoặc chọn vùng; formula bar xác nhận nội dung qua `commit_edit`. Thanh sheet cho phép chuyển/thêm và nhấp đúp để đổi tên. API xóa sheet có ở workbook nhưng chưa có lệnh tương ứng trong UI hiện tại; lỗi đổi tên trả về từ engine hiện bị bỏ qua ở hộp thoại.

[`appearance.rs`](../apps/sheet/src/app/appearance.rs) cấu hình theme sáng, Segoe UI cho chrome và các face thường/đậm/nghiêng/đậm nghiêng của Arial, Segoe UI, Times New Roman, Calibri từ `C:\Windows\Fonts`, kèm fallback của egui. [`icons.rs`](../apps/sheet/src/app/icons.rs) vẽ icon trực tiếp bằng Painter. Font được đăng ký không đồng nghĩa máy nào cũng có cùng face thực tế.

## Renderer lưới và trạng thái viewport

[`grid.rs`](../apps/sheet/src/app/grid.rs) dùng `ScrollArea::both().show_viewport`. Worksheet mới có extent hiển thị 26 cột × 1.000 hàng; extent mở rộng khi nạp dữ liệu, dán hoặc điều hướng đến địa chỉ xa hơn, trong giới hạn mô hình `MAX_ROWS`/`MAX_COLUMNS`. Renderer chỉ vẽ các ô cắt với viewport bằng `egui::Painter`. Đường kẻ 1px đặt tại tâm pixel để không bị nhòe thành hai hàng pixel. Scrollbar giữ input egui và vẽ lại track/thumb ngang theo ảnh tham chiếu.

Offset được giữ trong `grid_scroll`; `reveal_selection` đưa ô hiện hành vào vùng nhìn thấy khi điều hướng. Nội dung ô và đường lưới được clip vào phần thân; tiêu đề hàng/cột được vẽ riêng tại mép trên/trái của viewport để luôn nhìn thấy khi cuộn cả hai chiều. Đây là tiêu đề cố định, chưa phải hỗ trợ đóng băng hàng/cột dữ liệu tùy ý hoặc bảo toàn pane XLSX.

Vùng chọn phủ xanh nhạt; viền ô hiện hành và chấm góc dùng xanh dương `#1A73E8`. Chấm góc chưa có hành vi autofill. Tương tác gồm click/kéo, Shift mở rộng vùng, chọn toàn hàng/cột từ tiêu đề, menu ngữ cảnh và `TextEdit` tại ô khi sửa. Kích thước ô hiện cố định theo zoom, chưa có kéo đổi chiều rộng/cao, wrap hay merge. Zoom nằm trong khoảng 0,5–2,0.

Renderer lấy style, gọi `evaluate_cell` với ô có dữ liệu, định dạng kết quả theo `NumFormat` rồi vẽ chữ. Nó chọn face từ `bold`/`italic`, vẽ underline/strikethrough qua `TextFormat`, chuyển pt thành pixel bằng hệ số `96/72` và nhân zoom. Tên font ngoài bốn họ được hỗ trợ hiển thị bằng Arial; tên gốc vẫn thuộc mô hình dữ liệu.

## Mô hình workbook và typography

[`crates/workbook/src/lib.rs`](../crates/workbook/src/lib.rs) định nghĩa:

| Kiểu | Trách nhiệm |
|---|---|
| `CellAddress`, `CellRange` | Địa chỉ A1 với hàng/cột bắt đầu từ 1; giới hạn 1.048.576 hàng và 16.384 cột; phân tích và duyệt vùng chữ nhật. |
| `CellValue` | `Blank`, `Text`, `Number`, `Boolean`, `Formula`, `Error`; chuyển dữ liệu nhập và định dạng hiển thị cơ bản. |
| `Sheet` | Hai `BTreeMap` thưa riêng cho giá trị và style, không cấp phát toàn bộ ma trận ô. |
| `Workbook` | Danh sách sheet, sheet hiện hành, đường dẫn, cờ `dirty`, `preservation_warnings`; thêm/đổi tên/xóa sheet. |
| `CellStyle` | Typography, màu RGB, căn ngang và nhóm định dạng số; style mặc định không cần lưu trong map. |

Các trường của `CellStyle` hiện tại:

```rust
font_size: u16,                  // số nguyên pt; mặc định 10
font_family: String,             // mặc định "Arial"
bold: bool, italic: bool,
underline: bool, strikethrough: bool,
text_color: Option<[u8; 3]>, bg_color: Option<[u8; 3]>,
align: CellAlign,                // General, Left, Center, Right
num_format: NumFormat,           // General, Number, Currency, Percentage, Date
```

`is_default` kiểm tra cả cỡ/tên font và trang trí; vì vậy ô chỉ có typography tùy chỉnh, kể cả ô trống, vẫn giữ style. Ribbon giới hạn nhập cỡ 6–96 pt, còn mô hình dùng `u16`. Hiển thị tiền tệ hiện dùng `$`; đây chưa phải bộ định dạng theo locale hay hệ thống mã định dạng tùy chỉnh đầy đủ.

`insert_row`, `delete_row`, `insert_column`, `delete_column` dịch chuyển địa chỉ trong cả hai map. Chúng không phân tích lại chuỗi công thức để cập nhật tham chiếu; đổi tên sheet cũng chưa viết lại công thức liên quan. `clear_range` xóa cả dữ liệu lẫn style. Mô hình chưa có merge, filter, pivot, validation, conditional formatting hay đối tượng biểu đồ được lưu cùng workbook.

## Lệnh chỉnh sửa và phạm vi undo

Undo thuộc lớp ứng dụng, không phải một hệ thống transaction cho toàn workbook. `UndoItem` giữ `sheet_idx`, mô tả và hai danh sách `(CellAddress, CellValue, Option<CellStyle>)` trước/sau; `record_undo` giới hạn 100 mục và xóa redo khi ghi thay đổi mới. Undo/redo khôi phục các ô đã ghi nhận và cập nhật trạng thái chưa lưu.

Các đường lệnh có ghi lịch sử gồm sửa ô, áp dụng style, cắt/dán, xóa vùng, sắp xếp, thay thế hiện tại và thay tất cả. Chèn/xóa hàng/cột, thêm/đổi tên/xóa sheet chưa có structural undo; lịch sử cũng chưa được tái ánh xạ sau thay đổi cấu trúc. Không được suy ra mọi hành động đều có thể hoàn tác.

Sắp xếp dùng một khóa là cột của ô hiện hành, di chuyển cả giá trị và style trong vùng; khóa lấy từ giá trị thô. Tìm kiếm duyệt các ô có dữ liệu của sheet hiện hành, không phân biệt hoa/thường; thay chuỗi hiện dùng phép thay có phân biệt hoa/thường.

CSV/TSV nằm trong workbook engine. TSV xuất `display_text` và nhập bằng cách tách dòng/tab, không có định dạng clipboard phong phú hoặc escape cho tab/xuống dòng trong ô. UI gửi văn bản sao chép qua egui; nút dán đọc clipboard hệ thống bằng `arboard`, bàn phím xử lý sự kiện Paste và có bộ đệm nội bộ dự phòng.

## Engine công thức và context liên sheet

[`crates/formula/src/lib.rs`](../crates/formula/src/lib.rs) cung cấp tokenizer, Pratt parser, AST nội bộ và evaluator qua trait `FormulaContext::cell` / `range`. Parser hỗ trợ số học, so sánh, nối chuỗi, tham chiếu ô/vùng và tên sheet. Các hàm như `IF`, `IFS`, `SWITCH`, `IFERROR`, `IFNA`, `CHOOSE` có nhánh đánh giá chọn lọc; không khẳng định mọi hàm logic đều short-circuit.

Engine có một tập con hàm toán, thống kê, logic, văn bản, ngày giờ và tra cứu, ví dụ `SUM`, `SUMIF`, `IF`, `VLOOKUP`, `INDEX`, `MATCH`, `TEXTJOIN`, `DATE`, `ROUND`. Danh sách và ngữ nghĩa thực tế do các nhánh trong `call` quyết định; hàm không nhận diện trả `#NAME?`. Không coi số lượng hàm hay việc có tên hàm là bằng chứng tương thích toàn bộ Google Sheets.

`WorkbookContext` trong `app.rs` giải quyết tên sheet và địa chỉ, sau đó gọi lại evaluator cho ô công thức. Tập các cặp `(sheet_idx, CellAddress)` đang thăm phát hiện vòng lặp và trả `#REF!`; độ sâu từ 500 trả `#NUM!`. Vùng công thức trên 100.000 ô cũng trả `#NUM!`. Hiện tính theo yêu cầu, chưa có đồ thị phụ thuộc, cache kết quả hay lịch tính lại tăng dần.

Panel biểu đồ và helper thống kê hiện đọc giá trị thô trực tiếp từ `Sheet`, không đi qua context tính công thức. Thanh trạng thái hiển thị count/sum/average của vùng nhiều ô; helper tính thêm min/max nhưng UI chưa hiển thị chúng. `ChartItem` chỉ ở `NomSheetApp`, có một panel với nhãn cột đầu và chuỗi số cột cuối; biểu đồ chưa được lưu cùng workbook.

## Đọc/ghi XLSX và ranh giới bảo toàn

[`crates/xlsx/src/lib.rs`](../crates/xlsx/src/lib.rs) dùng `zip` và `quick-xml`, ánh xạ workbook relationships, shared/inline strings, giá trị, công thức và style vào mô hình. Writer dựng lại các phần `[Content_Types].xml`, relationships, workbook, styles và worksheet từ mô hình hiện có; nó không giữ nguyên các ZIP entry chưa hiểu.

`ParsedFont` / `StyleRegistry` đọc/ghi tên/cỡ font, đậm/nghiêng, underline, strike và RGB; fills/cellXfs mang màu nền, căn ngang và nhóm định dạng số được hỗ trợ. Cỡ font phân số hợp lệ được làm tròn về số nguyên pt; thuộc tính thiếu/không hợp lệ dùng mặc định của mô hình. Worksheet writer hợp nhất địa chỉ có dữ liệu và có style, nên style trên ô trống cũng được ghi lại.

Công thức lưu trong `<f>` với cached `<v>` rỗng; `calcPr` yêu cầu ứng dụng đọc tính lại. Không có cache kết quả hoặc bảo đảm mọi công thức nhận từ Excel/Google Sheets đều được Nom Sheet tính đúng. Định dạng số được ánh xạ về các nhóm hữu hạn, không bảo toàn mọi custom number format, theme, rich text hoặc thuộc tính OpenXML khác.

Biểu đồ, pivot/table nâng cao, filter, merge, validation, conditional formatting, macro, liên kết ngoài và metadata không có mô hình bảo toàn đầy đủ. Loader thêm `preservation_warnings` cho XLSX; `save_path` yêu cầu xác nhận khi lưu lại workbook có cảnh báo thành XLSX. Cảnh báo mang tính tổng quát, không phải báo cáo kiểm kê đầy đủ các thành phần bị bỏ qua.

Lưu XLSX ghi gói vào tệp tạm cạnh đích, hoàn tất ZIP, `sync_all` rồi `rename`; khi lỗi ghi/đổi tên, mã cố xóa tệp tạm và trả lỗi. Cách này giảm rủi ro ghi trực tiếp vào tệp đích, không cung cấp bảo đảm tuyệt đối khi mất điện hay trên mọi filesystem.

CSV chỉ xuất sheet đang chọn dưới dạng UTF-8; công thức xuất thành văn bản, style và các sheet khác không nằm trong tệp. UI xác nhận khi xuất workbook nhiều sheet thành CSV. Luồng CSV hiện ghi bằng `std::fs::write`, không dùng cơ chế tệp tạm của XLSX.

## Hộp thoại native và giới hạn tài nguyên

[`dialogs.rs`](../apps/sheet/src/app/dialogs.rs) gọi Win32 `GetOpenFileNameW` / `GetSaveFileNameW` qua `windows-sys`, lọc XLSX/CSV, kiểm tra đường dẫn và hỏi ghi đè khi lưu. Khi thiếu phần mở rộng, bộ lọc chọn `.xlsx` hoặc `.csv`. Nhánh ngoài Windows hiện trả `None`; không có bộ chọn tệp native đa nền tảng hoàn chỉnh. Xác nhận bỏ thay đổi khi tạo mới/mở tệp và xác nhận phạm vi lưu là các cửa sổ egui do `app.rs` quản lý.

| Giới hạn | Vị trí và ý nghĩa |
|---|---|
| 1.048.576 hàng × 16.384 cột | Giới hạn địa chỉ của mô hình/lưới, không phải dung lượng dữ liệu đã được kiểm thử toàn phần. |
| 100.000 ô | Guard cho sao chép, cắt, định dạng, xóa vùng, sắp xếp; context dùng cùng ngưỡng cho mỗi vùng công thức. Không áp dụng chung cho mọi lệnh. |
| 64 MiB / XML entry, 256 sheet | Guard trong XLSX reader; writer cũng kiểm tra số sheet. |
| `MAX_CELLS_PER_SHEET = 1_000_000` | Guard đếm ô trong parser XLSX; không phải giới hạn chung của mọi đường nạp/ghi hoặc chứng nhận chống mọi kiểu tiêu thụ tài nguyên. |
| 5.000.000 ô | Ngưỡng vùng xuất CSV trong workbook engine. |
| 100 mục | Độ dài tối đa undo cho các thay đổi ô được ghi nhận. |

## Phần kiến trúc chưa có cho mục tiêu Google Sheets

Hiện chưa có backend đồng biên tập, chia sẻ/phân quyền, Google Drive, bình luận/lịch sử phiên bản, Apps Script hay connector dữ liệu trực tuyến trong Nom Sheet. Những khả năng này cần các hệ thống riêng ngoài renderer native hiện tại.

Các tính năng pivot, filter/filter view, merge, validation, conditional formatting, đóng băng dữ liệu tùy chọn, autofill và cập nhật tham chiếu khi đổi cấu trúc cần mở rộng mô hình, lệnh UI và bộ đọc/ghi tương ứng. Structural undo cần lịch sử cho thay đổi cấu trúc. Lệnh In hiện dựng bảng HTML cục bộ đã escape dữ liệu rồi mở trình duyệt để người dùng in/lưu PDF; chưa có bộ phân trang, vùng in hoặc xuất PDF native. Bộ hàm/ngữ nghĩa Google Sheets và bảo toàn XLSX đầy đủ cũng chưa hoàn thành.

Chi tiết kích thước, lệnh chụp GPU và cách đo sai khác: [Đối chiếu giao diện](NOM_SHEET_VISUAL_REFERENCE.md).
