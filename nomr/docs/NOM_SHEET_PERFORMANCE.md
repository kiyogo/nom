# Nom Sheet — Thiết kế Hiệu năng & Tối ưu hóa

## 1. Lưu trữ Dữ liệu Thưa (Sparse In-Memory Representation)

Bảng tính Microsoft Excel có tới 1,048,576 hàng và 16,384 cột (tổng cộng hơn 17.1 tỷ ô). Nếu sử dụng mảng 2D dày đặc (dense array), ứng dụng sẽ tiêu tốn hàng chục Gigabyte RAM ngay khi vừa mở bảng tính trống.

Nom Sheet áp dụng cấu trúc **Sparse BTreeMap**:
- `cells: BTreeMap<CellAddress, CellValue>`: Chỉ lưu các ô thực sự có dữ liệu (số, chữ, công thức hoặc boolean).
- `styles: BTreeMap<CellAddress, CellStyle>`: Chỉ lưu kiểu dáng của các ô có định dạng đặc biệt khác mặc định.
- **Hiệu quả**: Một bảng tính trống tiêu thụ gần như 0 byte bộ nhớ heap. Một bảng tính có 10,000 ô dữ liệu chỉ tốn khoảng vài trăm Kilobyte RAM.

---

## 2. Kết xuất Giao diện Ảo hóa (UI Virtualization)

- **Nguyên lý**: Toàn bộ lưới hiển thị được đặt trong `egui::ScrollArea::vertical().show_rows(...)`.
- **Cơ chế**:
  - Dù tổng số hàng là 1,048,576 hàng, `show_rows` chỉ gọi hàm vẽ cho các hàng nằm trong khung hình (viewport) hiển thị của màn hình người dùng (khoảng 20–40 hàng tùy theo độ phân giải và mức thu phóng).
  - Cột cũng được giới hạn theo chiều rộng khả dụng của cửa sổ (`visible_columns`), chỉ tính toán và vẽ các cột trong tầm nhìn.
- **Tốc độ khung hình (Frame Rate)**: Duy trì ổn định 60–144 FPS mượt mà ngay cả khi người dùng cuộn nhanh bằng con lăn chuột hoặc thanh cuộn.

---

## 3. Quản lý Đệ quy & Giới hạn Tài nguyên An toàn

- **Giới hạn Độ sâu Công thức**: Đặt giới hạn `FORMULA_DEPTH_LIMIT = 500` để ngăn tràn ngăn xếp (Stack Overflow) khi đánh giá các công thức lồng ghép sâu.
- **Bảo vệ Tham chiếu Vòng lặp**: Cơ chế `HashSet<(sheet_idx, CellAddress)>` phát hiện ngay lập tức chu trình khép kín (ví dụ: A1 trỏ tới B1, B1 trỏ về A1), dừng việc tính toán và trả về `#REF!` mà không gây đơ ứng dụng.
- **Giới hạn Kích thước Vùng (Range Limit)**: Các hàm thao tác vùng như `SUM(A1:Z1000)` giới hạn tối đa `RANGE_CELL_LIMIT = 100,000` ô trong một công thức đơn lẻ để tránh nghẽn luồng giao diện chính.
- **Giới hạn Gói OpenXML ZIP**:
  - Giới hạn kích thước giải nén của mỗi thành phần XML trong file XLSX tối đa là 64 MiB.
  - Giới hạn tối đa 256 sheets và 1,000,000 ô trên mỗi sheet để ngăn chặn triệt để tấn công Zip Bomb (gói nén độc hại có kích thước nén nhỏ nhưng giải nén khổng lồ).
