# AI Chat cá nhân (Expo / React Native)

## Chạy ứng dụng
```bash
npm install
npx expo install --fix
npx expo start
```
Quét QR bằng Expo Go.

## Build APK Android
APK có thể được build trên GitHub Actions hoặc máy đã cài Java 17 và Android SDK:

```bash
npm install
npx expo prebuild --platform android --non-interactive
cd android
./gradlew assembleDebug
```

File APK nằm tại `android/app/build/outputs/apk/debug/app-debug.apk`. Repo có workflow tự build và tạo GitHub Release khi push tag dạng `v*`:

```bash
git tag v1.0.0
git push origin v1.0.0
```

APK trong workflow được ký bằng debug key, phù hợp cài thử; không dùng làm bản phát hành thương mại.

## Website tải ứng dụng
Trang tĩnh nằm trong thư mục `docs/` và được tự động deploy lên GitHub Pages khi cập nhật nhánh `main`. Trang sẽ có tại `https://hungban946-prog.github.io/MinecraftMusicPlugin/`. Nút tải APK sẽ hoạt động sau khi workflow tạo GitHub Release đầu tiên.

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
