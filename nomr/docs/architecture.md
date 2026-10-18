# KIẾN TRÚC HỆ THỐNG NOMR (MODULAR ARCHITECTURE)

Tài liệu này mô tả kiến trúc phân tán dạng module độc lập (Modular Architecture) của dự án **NOMR** (`nom-office-suite`). Toàn bộ mã nguồn được chia nhỏ theo nguyên lý đơn trách nhiệm (**Single Responsibility Principle**), các tệp được đặt tên đơn từ sạch sẽ, đơn giản nhất, không sử dụng ký tự gạch dưới `_`.

---

## 1. SƠ ĐỒ PHÂN BỐ TỆP MÃ NGUỒN (FILE TREE)

```
nomr/
├── Cargo.toml                          # Cấu hình Rust Workspace
├── rustfmt.toml                        # Tiêu chuẩn định dạng mã nguồn
├── AGENTS.md                           # Chỉ thị điều hành và bảng tiến độ AI
├── docs/                               # Tài liệu kỹ thuật chi tiết (.md)
│   ├── architecture.md                 # Kiến trúc hệ thống và sơ đồ module
│   ├── packaging.md                    # Cơ chế đóng gói, tải luồng & Control Panel
│   └── ui.md                           # Quy chuẩn giao diện phẳng tối giản
├── crates/
│   └── package/                        # Thư viện lõi quản lý gói & vòng đời
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                  # Re-export các module và kiểm thử tự động
│           ├── manifest.rs             # Struct AppInfo và Enum trạng thái AppStatus
│           ├── catalog.rs              # Danh mục ứng dụng mặc định (Writer, Sheet, ...)
│           ├── paths.rs                # Quản lý đường dẫn cài đặt (%LOCALAPPDATA%\NomOffice)
│           ├── downloader.rs           # Động cơ tải về chạy nền, tính MB/s và %
│           ├── process.rs              # Khởi chạy tệp thực thi ứng dụng
│           ├── sync.rs                 # Quét đồng bộ 2 chiều với Control Panel Windows
│           ├── install.rs              # Điều phối quy trình cài đặt và gỡ bỏ sạch sẽ
│           ├── auth.rs                 # Quản lý phiên làm việc & đăng nhập tài khoản
│           └── platform/               # Module tương tác hệ điều hành chuyên biệt
│               ├── mod.rs              # Điều hướng theo target_os
│               ├── linux/              # Quản lý .desktop trên Linux
│               │   └── mod.rs
│               └── windows/            # Tích hợp sâu hệ điều hành Windows
│                   ├── mod.rs
│                   ├── registry.rs     # Ghi & xóa Registry HKCU Uninstall
│                   ├── shortcut.rs     # Tạo & xóa Desktop Shortcut (.lnk)
│                   └── script.rs       # Sinh mã script uninstall.cmd & launcher.cmd
└── apps/
    └── launcher/                       # Ứng dụng Desktop Office Hub Native
        ├── Cargo.toml
        └── src/
            ├── main.rs                 # Khởi chạy ứng dụng & xử lý tham số CLI (--uninstall)
            ├── font.rs                 # Tải font Segoe UI tiếng Việt từ Windows Fonts
            ├── theme.rs                # Cấu hình Visuals phẳng, nền #F8FAFC, zero hover
            ├── app.rs                  # Vòng lặp LauncherApp, quản lý State & Event Loop
            └── views/                  # Các khối giao diện phân rã đơn từ sạch sẽ
                ├── mod.rs              # Re-export các view components
                ├── header.rs           # Tiêu đề "Nom Office", profile avatar & sync pill
                ├── filter.rs           # Tab bộ lọc (Tất cả, Đã cài, Chưa cài) & tìm kiếm
                ├── list.rs             # Điều phối danh sách thẻ ứng dụng
                ├── item.rs             # Thẻ hiển thị một ứng dụng: icon, mô tả, nút bấm
                ├── progress.rs         # Thanh tiến trình tải phẳng màu than chì
                ├── login.rs            # Hộp thoại Modal đăng nhập tài khoản
                └── footer.rs           # Ghi chú chân trang thông tin Control Panel
```

---

## 2. TRÁCH NHIỆM CHI TIẾT CỦA TỪNG MODULE

### 2.1 Crate `nom-package` (`crates/package`)
| Tệp Module | Trách nhiệm duy nhất (Single Responsibility) |
| :--- | :--- |
| **`manifest.rs`** | Khai báo cấu trúc dữ liệu `AppInfo` và `AppStatus`. |
| **`catalog.rs`** | Quản lý danh mục gói phần mềm bản địa (`Writer`, `Sheet`, `Slide`, `PDF`, `Markdown`, `HTML`). |
| **`paths.rs`** | Xác định đường dẫn thư mục cài đặt (`%LOCALAPPDATA%\NomOffice\<app_id>`) và đường dẫn tệp thực thi. |
| **`downloader.rs`** | Thực thi tác vụ tải về bất đồng bộ trên luồng nền (`tokio::spawn`), tính toán tốc độ MB/s và dung lượng. |
| **`process.rs`** | Quản lý tiến trình khởi chạy ứng dụng độc lập (`launch_app`). |
| **`sync.rs`** | Đồng bộ trạng thái hai chiều giữa Registry Control Panel, ổ đĩa và danh sách AppInfo. |
| **`auth.rs`** | Quản lý phiên làm việc `UserSession`, lưu trữ bền vững vào `%LOCALAPPDATA%\NomOffice\session.json`. |
| **`platform/windows/registry.rs`** | Can thiệp trực tiếp Windows Registry tại nhánh `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Nom_<id>`. |
| **`platform/windows/shortcut.rs`** | Tự động tạo và xóa lối tắt Desktop (`.lnk`) qua PowerShell WScript.Shell. |
| **`platform/windows/script.rs`** | Tạo tệp `uninstall.cmd` phục vụ khi gỡ trực tiếp từ Windows Control Panel (`appwiz.cpl`). |
| **`install.rs`** | Điều phối việc tạo file, ghi registry, tạo shortcut thành chu trình khép kín. |

---

### 2.2 Ứng dụng `nom-launcher` (`apps/launcher`)
| Tệp Module | Trách nhiệm duy nhất (Single Responsibility) |
| :--- | :--- |
| **`main.rs`** | Khởi chạy chương trình, phân tích tham số CLI, nạp Tokio Runtime và eframe. |
| **`font.rs`** | Nạp font hệ thống `Segoe UI` để tiếng Việt hiển thị sắc nét. |
| **`theme.rs`** | Nền canvas xám dịu `#F8FAFC`, triệt tiêu 100% hiệu ứng hover (`hovered = inactive`), bo góc mềm mại. |
| **`app.rs`** | Vòng lặp ứng dụng, kết nối dữ liệu và gọi các view con. |
| **`views/header.rs`** | Logo Nom Office, tiêu đề, avatar người dùng, nút đăng nhập/đăng xuất và huy hiệu Control Panel. |
| **`views/filter.rs`** | Thanh chuyển đổi tab lọc (`Tất cả`, `Đã cài đặt`, `Chưa cài đặt`) và ô tìm kiếm ứng dụng. |
| **`views/list.rs`** | Điều phối danh sách thẻ ứng dụng theo bộ lọc và từ khóa. |
| **`views/item.rs`** | Thẻ Card trắng bo góc 8px cho từng app, Icon Badge màu sắc và các nút hành động tĩnh. |
| **`views/progress.rs`** | Thanh tiến trình tải bo góc 4px. |
| **`views/login.rs`** | Hộp thoại Modal đăng nhập tài khoản người dùng và nút đăng nhập nhanh. |
| **`views/footer.rs`** | Chân trang thông tin hệ thống. |
