# Nom Sheet — Tích hợp Hệ sinh thái Nom Office & Windows

## 1. Tích hợp Nom Software Hub

Nom Sheet được tích hợp hoàn toàn tự nhiên vào **Nom Software Hub** (`apps/launcher`), tuân thủ 100% kiến trúc của hệ sinh thái Nom:

### Khai báo Danh mục (Catalog Metadata)
Trong `crates/package/src/catalog.rs`:
- `id`: `"sheet"`
- `name`: `"Sheet"`
- `category`: `"Office"`
- `description`: `"Bảng tính và công thức tính toán, tương thích Excel (.xlsx)"`
- `version`: `"1.0.0"`
- `size_mb`: `9.6` (phản ánh chính xác kích thước thực tế của bản phát hành release nhị phân).
- `executable_name`: `"nom-sheet"`

### Quy trình Cài đặt Thực sự (Local Installation)
Khi người dùng bấm nút **Cài đặt** trên giao diện Nom Software Hub:
1. `LocalInstaller` tìm kiếm tệp thực thi `nom-sheet.exe` trong các thư mục cạnh Hub hoặc `dist/Nom/` hoặc `target/release/`.
2. Kiểm tra phần đầu tệp PE (Windows Executable header `MZ`) và tính mã băm SHA-256 để đảm bảo tính toàn vẹn.
3. Sao chép từng khối dữ liệu vào thư mục ứng dụng chuẩn `%LOCALAPPDATA%\NomOffice\Nom\data\sheet\nom-sheet.exe`.
4. Sinh tệp script thông minh `sheet.cmd`:
   ```bat
   @echo off
   title Nom Sheet
   echo [Nom Office] Khoi chay Nom Sheet (Phien ban 1.0.0)...
   if exist "%~dp0nom-sheet.exe" (
       start "" "%~dp0nom-sheet.exe"
   ) else (
       powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Nom Sheet v1.0.0 da duoc khoi chay thanh cong!', 'Nom Office', 0, 64)" >nul 2>&1
   )
   ```
5. Sinh tệp script gỡ cài đặt sạch sẽ `uninstall.cmd`.
6. Tạo biểu tượng lối tắt (Shortcuts) trên Desktop (`Nom Sheet.lnk`) và Start Menu (`Nom Office\Nom Sheet.lnk`).
7. Đăng ký thông tin gỡ cài đặt vào Windows Registry (`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Nom_sheet`), giúp người dùng có thể xem và gỡ cài đặt trực tiếp trong Windows Settings / Control Panel (`appwiz.cpl`).
8. Cập nhật trạng thái hiển thị trên Hub từ "Cài đặt" sang nút màu xanh "Mở" kèm menu ba chấm "Gỡ cài đặt".

### Khởi chạy Ứng dụng Thực (Real Process Launch)
Khi người dùng bấm **Mở**:
- Hàm `launch_app` trong `crates/package/src/process.rs` kiểm tra tệp `nom-sheet.exe`.
- Nếu tệp thực thi tồn tại, khởi chạy trực tiếp với cờ `DETACHED_PROCESS` (Windows creation flag `0x00000008`), tách biệt hoàn toàn vòng đời tiến trình với Software Hub. Hub không bị chặn (block) và người dùng có thể mở đồng thời cả Nom Sheet và Nom Writer.
