# AI Chat cá nhân (Expo / React Native)

## Chạy ứng dụng
```bash
npm install
npx expo install --fix
npx expo start
```
Quét QR bằng Expo Go hoặc build APK bằng EAS.

## Cấu hình API
Trong Cài đặt, nhập Base URL, API Key và Model. App hiện dùng giao thức tương thích OpenAI Chat Completions; Base URL có thể là URL gốc (ví dụ `https://host/v1`) hoặc endpoint đầy đủ kết thúc bằng `/chat/completions`. Chưa thể xác nhận một nhà cung cấp cụ thể nếu chưa có tài liệu API của nhà cung cấp.

## Tính năng hiện có
- Chat và lịch sử hội thoại lưu cục bộ, không cần tài khoản.
- API Key lưu bằng Expo SecureStore (Android Keystore / iOS Keychain).
- Công cụ AI: liệt kê/đọc/tìm kiếm/tạo/chia sẻ/mã hóa/giải mã file; xem và giải nén ZIP; ghi nhớ và quên thông tin.
- Đọc TXT, mã nguồn, CSV, JSON, DOCX, XLS/XLSX và gửi ảnh cho model có hỗ trợ vision.
- Đọc file văn bản theo từng đoạn, có thể tiếp tục đến cuối file; tìm kiếm tuần tự trên toàn file.

## Giới hạn cần biết
- PDF chưa được hỗ trợ đọc trực tiếp.
- Đọc ảnh cần model/API có hỗ trợ đầu vào hình ảnh.
- Tool calling cần API hỗ trợ chuẩn `tools` của OpenAI Chat Completions.
- Không có streaming ở phiên bản hiện tại.
- App gọi API trực tiếp từ điện thoại; API Key nằm trên thiết bị, không nên chia sẻ APK đã cấu hình Key.
- Đây là bản nâng cấp bước đầu, cần chạy thử trên Android và xác nhận API thực tế trước khi coi là ổn định.
