# QUY CHUẨN THIẾT KẾ GIAO DIỆN & HỆ THỐNG ĐĂNG NHẬP (UI & AUTH SPECIFICATION)

Tài liệu này quy định chi tiết về triết lý giao diện, các quy chuẩn hình học, quy tắc Zero Hover và hệ thống đăng nhập tài khoản người dùng của ứng dụng **Nom Launcher** (`apps/launcher`).

---

## 1. NGUYÊN TẮC THIẾT KẾ TĨNH ZERO HOVER (NO HOVER EFFECTS)

Theo yêu cầu nghiêm ngặt từ người dùng và hệ thống, ứng dụng áp dụng quy chuẩn tĩnh 100%:

1. **Triệt tiêu 100% hiệu ứng khi di chuột (Zero Hover Effects)**:
   * Khi con trỏ chuột lướt qua bất kỳ nút bấm (`[ Cài đặt ]`, `[ Mở ]`, `[ Gỡ ]`, `[ Đăng nhập ]`), thẻ ứng dụng hay biểu tượng: **màu sắc, độ sáng, kích thước và đường viền được giữ nguyên tuyệt đối 100%**.
   * Triển khai trong [**`theme.rs`**](file:///E:/DATA/source/Nom/nomr/apps/launcher/src/theme.rs):
     ```rust
     visuals.widgets.hovered = visuals.widgets.inactive;
     ```
2. **Không làm mờ, không bóng đổ (NO BLUR / NO SHADOW / NO VIGNETTE)**:
   * Thiết lập `Shadow::NONE` cho toàn bộ cửa sổ và popup dialog.
3. **Bo góc tĩnh mềm mại (Static Rounded Corners)**:
   * Thẻ ứng dụng (Card): `Rounding::same(10.0px)`.
   * Biểu tượng ứng dụng (App Icon Badge): `Rounding::same(10.0px)`.
   * Nút bấm hành động (Buttons): `Rounding::same(6.0px)`.
   * Huy hiệu trạng thái (Status Pill): `Rounding::same(13.0px)`.
   * Thanh tiến trình tải (Progress Bar): `Rounding::same(4.0px)`.
   * Hộp thoại Modal Đăng nhập: `Rounding::same(12.0px)`.
4. **Nền Canvas xám dịu mắt (`#F8FAFC`)**:
   * Giúp các thẻ Card ứng dụng màu trắng tuyết `#FFFFFF` với viền mỏng `#E2E8F0` nổi bật rõ nét, có chiều sâu thị giác.

---

## 2. HỆ THỐNG ĐĂNG NHẬP & QUẢN LÝ TÀI KHOẢN (AUTHENTICATION)

Được triển khai trong [**`crates/package/src/auth.rs`**](file:///E:/DATA/source/Nom/nomr/crates/package/src/auth.rs) và [**`apps/launcher/src/views/login.rs`**](file:///E:/DATA/source/Nom/nomr/apps/launcher/src/views/login.rs):

### 2.1 Cấu trúc Phiên người dùng (`UserSession`)
```rust
pub struct UserSession {
    pub is_logged_in: bool,
    pub name: String,             // Tên hiển thị (Ví dụ: "Sơn Nguyễn")
    pub email: String,            // Email đăng nhập
    pub plan: String,             // Gói dịch vụ ("Nom Pro")
    pub avatar_initials: String,  // Ký tự viết tắt hiển thị trên Avatar (Ví dụ: "SN")
}
```

### 2.2 Cơ chế Lưu trữ Bền vững (Persistence)
* Phiên đăng nhập được lưu trữ tự động vào tệp JSON:
  `%LOCALAPPDATA%\NomOffice\session.json`
* Khi khởi động lại Launcher, hệ thống tự động nạp phiên người dùng trước đó.

### 2.3 Giao diện Đăng nhập (Login Modal Dialog)
* Khi bấm nút `[ Đăng nhập ]` trên Header, hộp thoại Modal sẽ xuất hiện căn giữa màn hình với lớp nền đen mờ (Dimmed Backdrop) bao phủ toàn màn hình:
  * Thẻ Card bo góc mềm mại 12px với viền xám sáng, không có thanh tiêu đề OS thô ráp.
  * Ô nhập Email hoặc Tên tài khoản (hint `email@nomoffice.org`).
  * Ô nhập Mật khẩu (chế độ ẩn ký tự `password: true`).
  * Nút `[ Đăng nhập ]` chính (nền đen/xanh than, chữ trắng, bo góc 8px).
  * Nút `[ Đăng nhập nhanh tài khoản mẫu ]` (kích hoạt ngay tài khoản mẫu).
  * Nút `[ Đóng ]` hoặc bấm vào lớp nền mờ bên ngoài để thoát.
* Khi đã đăng nhập thành công:
  * Header hiển thị **Avatar tròn 32px** mang ký tự viết tắt `SN` trên nền xanh dương `#2563EB`.
  * Tên người dùng `Sơn Nguyễn` và gói `Nom Pro`.
  * Nút `[ Đăng xuất ]` (màu đỏ nhạt `#EF4444`, bo góc 6px) để dọn sạch phiên làm việc.

---

## 3. THANH ĐIỀU HƯỚNG BỘ LỌC & TÌM KIẾM (FILTER & SEARCH)

Được triển khai trong [**`apps/launcher/src/views/filter.rs`**](file:///E:/DATA/source/Nom/nomr/apps/launcher/src/views/filter.rs):

1. **Bộ lọc danh mục (Tabs)**:
   * `Tất cả (6)`: Hiển thị toàn bộ ứng dụng trong kho.
   * `Đã cài đặt (N)`: Chỉ hiển thị các ứng dụng đã cài đặt và đăng ký vào Windows Control Panel.
   * `Chưa cài đặt (N)`: Chỉ hiển thị các ứng dụng chưa cài đặt.
2. **Ô tìm kiếm ứng dụng (Live Search)**:
   * Tìm kiếm tức thời theo tên ứng dụng, mô tả hoặc danh mục mà không cần reload.
   * Hiển thị trạng thái trống ("Không tìm thấy ứng dụng") nếu không có kết quả trùng khớp.

---

## 4. THANH TAB & THANH CÔNG CỤ CHUẨN 100% GOOGLE CHROME (CHROME TAB STRIP & TOOLBAR)

Được triển khai trong [**`apps/launcher/src/views/tabs.rs`**](file:///E:/DATA/source/Nom/nomr/apps/launcher/src/views/tabs.rs):

### 4.1 Bảng màu Chuẩn Google Chrome (Dark/Sage Theme)
* **Nền dải Tab (`CHROME_BG`)**: `rgb(21, 35, 19)` (#152313) - Tông rêu tối sang trọng chuẩn Material You.
* **Nền Tab đang chọn (`CHROME_ACTIVE_TAB_BG`)**: `rgb(32, 48, 30)` (#20301E) - Nối liền 100% không đứt đoạn với thanh Toolbar bên dưới.
* **Màu chữ Tab đang chọn**: `rgb(240, 248, 238)` (trắng sáng, bold).
* **Màu chữ Tab phụ / không chọn**: `rgb(165, 185, 160)` (xanh xám nhạt).
* **Vạch phân cách giữa 2 tab không chọn**: Vạch đứng 1px màu `rgb(55, 75, 50)`.
* **Nền thanh Omnibox tìm kiếm**: `rgb(21, 35, 19)` (#152313) với viền mỏng `rgb(55, 75, 52)`.

### 4.2 Chi tiết Hình học & Trải nghiệm
1. **Nút Điều hướng Tab góc trái (`v`)**: Nút bo góc 6px (24x24px) hỗ trợ tìm kiếm và chuyển đổi nhanh tab.
2. **Hình dạng Tab (Active Tab Rounded Top)**: Bo tròn 2 góc trên 8px (`Rounding { nw: 8.0, ne: 8.0, sw: 0.0, se: 0.0 }`), phẳng đáy để nối liền mạch vào thanh công cụ.
3. **Favicon & Nút đóng (`✕`)**:
   * Mỗi tab đều có favicon màu riêng biệt (Kho ứng dụng: `N`, Đã cài: `✓`, Chưa cài: `↓`, các tab app riêng: `W`, `S`, `P`...).
   * Tab đang chọn có nút đóng `✕` tinh tế ở góc phải để đóng tab độc lập.
4. **Nút thêm Tab mới (`+`)**: Nằm ngay bên phải tab cuối cùng để mở thêm tab ứng dụng mới.
5. **Thanh Địa chỉ Omnibox (Pill Shape)**:
   * Thanh tìm kiếm hình viên thuốc chuẩn Chrome (`Rounding::same(15.0px)`).
   * Đi kèm nút `<` (Back), `>` (Forward), `↻` (Reload/Sync Control Panel).
   * Tích hợp huy hiệu `● Control Panel` và Avatar tài khoản người dùng ở góc phải.
