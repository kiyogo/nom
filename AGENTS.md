# Quy tắc làm việc cho toàn bộ repository Nom

Các quy tắc này áp dụng cho mọi công việc trong `E:\DATA\source\Nom` và các thư mục con.

## Lưu và đẩy thay đổi lên GitHub sau mỗi prompt

- Repository đích: https://github.com/kiyogo/nom, remote `origin` phải trỏ đến repository này.
- Sau mỗi lần hoàn tất một phần code, sửa lỗi hoặc cập nhật tài liệu, phải kiểm tra thay đổi, chạy kiểm tra phù hợp, commit và push lên GitHub ngay.
- Trước khi kết thúc mỗi lượt xử lý prompt, phải bảo đảm toàn bộ thay đổi hợp lệ của lượt đó đã được commit và push lên GitHub, kể cả thay đổi trong `AGENTS.md`.
- Một prompt được phép có nhiều commit và nhiều lần push khi cần. Không giới hạn số lần push; không bắt buộc hoặc cố định đúng hai lần push và không chia thay đổi thành đúng hai phần một cách máy móc.
- Nếu prompt không tạo thay đổi mới, không tạo commit rỗng; kiểm tra và push các commit cục bộ chưa được đẩy nếu có.
- Khi người dùng yêu cầu đẩy hết, bao gồm các commit cục bộ đang chờ và các thay đổi hợp lệ trong phạm vi repository; kiểm tra nội dung trước khi đưa vào commit.
- Không đưa khóa bí mật, mật khẩu, token, dữ liệu riêng tư, thư mục phụ thuộc hoặc tệp build/cache sinh tự động lên GitHub chỉ để đáp ứng yêu cầu đẩy hết. Tôn trọng `.gitignore` và chỉ theo dõi các tệp đầu ra khi người dùng yêu cầu rõ ràng.
- Không ghi đè hoặc xóa thay đổi sẵn có của người dùng. Không tự dùng force-push, reset phá hủy dữ liệu hoặc ghi đè lịch sử trên remote.
- Nếu push bị chặn bởi quyền truy cập, xác thực, mất kết nối hoặc xung đột remote, giữ nguyên công việc đã lưu, kiểm tra nguyên nhân và báo rõ phần chưa đẩy được. Không báo thành công khi chưa xác nhận push thành công.

## Quy trình cuối lượt

1. Kiểm tra `git status`, diff và remote đích.
2. Chạy các kiểm tra phù hợp với phần vừa thay đổi.
3. Stage các tệp hợp lệ, tạo commit mô tả đúng nội dung.
4. Push nhánh đang làm việc lên `origin`; có thể lặp lại quy trình nhiều lần trong một prompt.
5. Xác nhận nhánh cục bộ đã đồng bộ với remote và thông báo ngắn gọn kết quả cho người dùng.
