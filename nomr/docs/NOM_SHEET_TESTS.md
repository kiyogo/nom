# Nom Sheet — Báo cáo & Tài liệu Kiểm thử

## 1. Lệnh Thực thi Kiểm thử Workspace

Để thực thi toàn bộ bài kiểm tra tự động trên mã nguồn:

```powershell
cargo test --workspace
```

Để kiểm tra riêng từng crate / ứng dụng:

```powershell
cargo test -p nom-workbook
cargo test -p nom-formula
cargo test -p nom-xlsx
cargo test -p nom-sheet
cargo test -p nom-package
cargo test -p nom-launcher
```

---

## 2. Báo cáo Kết quả Kiểm thử (100% Pass)

Toàn bộ **34 bài kiểm tra** tự động trên tất cả 6 crates và applications trong kho mã nguồn đều vượt qua thành công:

| Crate / Application | Số lượng Test | Trạng thái | Các ca kiểm thử tiêu biểu |
|---|---|---|---|
| **`nom-formula`** | 6 tests | **100% PASS** | - `math_and_stats_functions`: Kiểm tra các hàm SUM, AVERAGE, MIN, MAX, PRODUCT, ABS, ROUND, CEILING, FLOOR, POWER, SQRT.<br>- `text_and_date_functions`: Kiểm tra LEFT, RIGHT, MID, LEN, TRIM, UPPER, LOWER, CONCATENATE, TEXTJOIN, TODAY, DATE, YEAR.<br>- `criteria_and_lookup_functions`: Kiểm tra VLOOKUP, INDEX, MATCH, SUMIF, COUNTIF, AVERAGEIF với các tiêu chí toán học `>`, `<=`, `<>`.<br>- `if_short_circuits_unused_error_branch`: Kiểm tra nhánh không thực thi không kích hoạt lỗi chia cho 0.<br>- `evaluates_precedence_references_and_ranges`: Kiểm tra độ ưu tiên toán tử số học và tham chiếu vùng.<br>- `reports_division_and_unknown_function_errors`: Kiểm tra trả về lỗi `#DIV/0!` và `#NAME?`. |
| **`nom-workbook`** | 7 tests | **100% PASS** | - `cell_styles_and_formatting`: Kiểm tra lưu trữ và truy xuất CellStyle (đậm, nghiêng, màu sắc, căn lề, định dạng số).<br>- `row_and_column_insert_delete`: Kiểm tra chèn hàng, xóa hàng, chèn cột, xóa cột và dịch chuyển ô/kiểu tương ứng.<br>- `sparse_sheet_tracks_only_populated_cells`: Kiểm tra tính năng lưu trữ thưa, không cấp phát ô rỗng.<br>- `csv_round_trip_quotes_and_preserves_vietnamese`: Kiểm tra đọc và ghi CSV với tiếng Việt có dấu, ký tự xuống dòng và dấu ngoặc kép.<br>- `tsv_export_and_import`: Kiểm tra xuất và nhập chuỗi TSV cho Clipboard.<br>- `sheet_names_are_unique_and_valid`: Kiểm tra tính duy nhất và tính hợp lệ của tên trang tính.<br>- `parses_excel_address_boundaries`: Kiểm tra phân tích tọa độ ô từ A1 đến XFD1048576. |
| **`nom-xlsx`** | 3 tests | **100% PASS** | - `xlsx_round_trip_preserves_styles_and_number_formats`: Kiểm tra lưu và nạp tệp OpenXML với `xl/styles.xml`, bảo toàn đầy đủ in đậm, in nghiêng, màu nền, căn lề và định dạng số.<br>- `xlsx_round_trip_keeps_sheets_values_and_formulas`: Kiểm tra lưu và nạp nhiều sheet, giá trị tế bào và thẻ công thức `<f>`.<br>- `rejects_relationships_that_escape_worksheet_folder`: Kiểm tra bảo mật chống tấn công Path Traversal qua XML relationships. |
| **`nom-sheet`** | 2 tests | **100% PASS** | - `selection_statistics_computes_sum_avg_min_max`: Kiểm tra thuật toán tính toán thống kê vùng chọn (Count, Sum, Avg, Min, Max).<br>- `multi_sheet_formula_context_calculates_cross_sheet_and_prevents_cycles`: Kiểm tra tính toán công thức tham chiếu chéo giữa các sheet (`=Sheet1!A1*2`) và phát hiện đệ quy vòng lặp trả về `#REF!`. |
| **`nom-package`** | 6 tests | **100% PASS** | - `test_catalog`: Xác thực danh mục ứng dụng, bao gồm kích thước thật 9.6 MB của Nom Sheet.<br>- `test_full_install_and_uninstall_lifecycle`: Kiểm tra vòng đời cài đặt tệp nhị phân, tạo shortcut, và gỡ cài đặt sạch sẽ.<br>- `test_control_panel_registration`: Kiểm tra đăng ký và hủy đăng ký với Windows Registry (`appwiz.cpl`).<br>- `install_fails_instead_of_creating_a_placeholder_when_package_is_missing`: Kiểm tra không tạo shortcut hay file giả khi thiếu file thực thi thật.<br>- `test_session_lifecycle`: Kiểm tra quản lý phiên người dùng trong Hub.<br>- `test_initials_computation`: Kiểm tra tính toán ký tự đại diện avatar. |
| **`nom-launcher`** | 10 tests | **100% PASS** | - `test_directwrite_engine_vietnamese_rendering`: Kiểm tra DirectWrite engine hiển thị tiếng Việt mượt mà.<br>- `test_window_control_caption_glyphs`: Kiểm tra các nút điều khiển cửa sổ chuẩn Segoe Fluent Icons.<br>- `test_typography_metrics_conform_to_windows_11_spec`: Kiểm tra thông số kiểu chữ Windows 11.<br>- `hub_filters_use_existing_catalog_and_install_state`: Kiểm tra bộ lọc danh mục và trạng thái cài đặt trong Hub.<br>- `new_tab_grows_from_its_left_edge_and_close_reverses_it`: Kiểm tra hoạt họa tab mượt mà.<br>- Các bài kiểm tra font, toolbar, layout clip rect và độ rộng tile. |

---

## 3. Quy trình Đóng gói & Phát hành Bản nhị phân

Lệnh đóng gói chế độ Release:

```powershell
cargo build --release
```

Kết quả sinh ra hai tệp thực thi độc lập:
1. `nom-sheet.exe` (~9.4 MB) tại `target/release/nom-sheet.exe` và `dist/Nom/nom-sheet.exe`.
2. `nom-launcher.exe` (~9.3 MB) tại `target/release/nom-launcher.exe` và `dist/Nom/nom-launcher.exe`.
