# Đối chiếu giao diện Sheet với ảnh tham chiếu

Giao diện tiếp tục dùng Rust/egui/wgpu. Người dùng đã chọn giữ tên/lệnh Sheet và khớp bố cục ảnh Docs/Google Sheets. Các ảnh tham chiếu là crop 1068 × 189 (chrome Docs) và 1084 × 848 (formula/grid/footer). Chúng không bao gồm toàn bộ cửa sổ gốc; tên tài liệu và tên lệnh không dùng để chứng nhận tương đương từng pixel.

## Kích thước ở 100% DPI / zoom

| Thành phần | Logical pixel |
|---|---:|
| Header, gồm điều khiển cửa sổ | 42 |
| Tab | 32 |
| Khoảng đệm + ribbon File | 6 + 83, tổng 89 |
| Toàn bộ chrome phía trên | 163 |
| Formula bar, gồm dải nền 15px | 43 |
| Column header | 24 |
| Row header gutter | 44 |
| Column pitch | 101 |
| Row pitch | 21 |
| Horizontal scrollbar | 12 |
| Sheet footer | 39 |

Header đặt logo tại (11,11), 48 × 22. Tên tài liệu bắt đầu x=195. Tâm các lệnh File ở x=50,112,174,236,307,369,431,502. Icon Lucide gốc có stroke 1.5, kích thước 24/20/16px tùy vị trí. URI texture có cả kích thước và DPI để bản 16px không bị kéo lớn lên 24px. Font header là Segoe UI, tên tài liệu Segoe UI Semibold; grid dùng Arial.

Grid vẽ phần đang thấy. Extent worksheet mới 26 cột × 1.000 hàng, mở rộng theo dữ liệu/địa chỉ; không cấp phát ma trận đầy đủ. Chọn cả hàng/cột không tự mở rộng extent lên giới hạn tối đa.

## Chụp và so sánh

Build binary rồi chạy `nom-sheet.exe --capture-ui <absolute-output.png>`. Chế độ này mở viewport 1892 × 1011, đặt 100% DPI, đợi các frame/texture ổn định, nhận `Event::Screenshot` trực tiếp từ bộ vẽ GPU, lưu PNG và tự đóng. Không chụp nội dung của một cửa sổ khác đang che app.

Script `apps/sheet/tools/compare-reference.ps1` nhận `-Capture`, `-HeaderReference`, `-GridReference`, `-Report`. Nó so sánh crop header ở y=0 và crop grid ở y=163, ghi tỷ lệ pixel bằng nhau, sai khác kênh màu và tọa độ đường lưới. Khi nhận diện đường, dung sai màu là 1 mức để xử lý làm tròn màu GPU; dung sai tọa độ là **0px**. Toàn bộ phép so sánh raster vẫn dùng màu chính xác và báo riêng.

Tỷ lệ pixel trùng cao có nhiều ô trắng; không phải chứng nhận không sai pixel. Cách raster hóa glyph, DPI, nội dung tên tài liệu và tên lệnh có thể khác ảnh chụp trình duyệt. Chỉ báo khớp hoàn toàn khi phép đo raster thực sự bằng 100%, không suy ra từ kích thước hoặc việc build thành công.

Lần đo Windows 100% DPI ngày 23/10/2026: toàn bộ 34 đường ngang, 10 đường dọc và các cạnh viền A1 được kiểm tra khớp tọa độ; crop grid khớp chính xác 97,341% pixel, 99,130% nằm trong 8 mức màu, sai khác trung bình mỗi kênh 0,6605/255. Header khớp thô 88,149%; phép đo này bao gồm tên tài liệu và các tên lệnh Sheet đã được người dùng chọn giữ lại. Đây là kết quả đo có giới hạn, không phải tuyên bố tương đương raster 100%.
