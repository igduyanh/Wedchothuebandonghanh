# Chi Tiết Các Tính Năng Realtime (Chat & Notifications) trong Dự Án

Hệ thống cung cấp trải nghiệm theo thời gian thực (Realtime) nhờ sự kết hợp giữa **Spring WebSocket** với giao thức **STOMP** và **SockJS**.

Dưới đây là chi tiết các thành phần làm nên hệ thống này:

## 1. Cấu hình WebSocket (`WebSocketConfig.java`)
- **Endpoint kết nối**: `/ws`. Đây là địa chỉ mà Frontend (JavaScript) sẽ gọi tới để mở luồng kết nối WebSocket (`new SockJS('/ws')`).
- **Handshake Interceptor**: Sử dụng `HttpSessionHandshakeInterceptor` để "sao chép" các thông tin đăng nhập trong HTTP Session (VD: `userId`, `role`) đưa vào WebSocket Session, giúp hệ thống biết được ai đang kết nối.
- **Message Broker**: Sử dụng Simple Broker mặc định của Spring với prefix cho các topic lắng nghe là `/topic`.

## 2. Bảo Mật và Phân Quyền Kênh Đăng Ký (`StompSubscribeInterceptor.java`)
Điểm hay của hệ thống này là không cho phép người dùng lắng nghe ngẫu nhiên các topic chặn luồng dữ liệu của người khác nhờ vào `ChannelInterceptor` bắt lấy sự kiện `SUBSCRIBE`:
- Khi client đăng ký lắng nghe `/topic/chat.booking.{bookingId}` (Kênh Chat nhóm):
  - Hệ thống kiểm tra xem `userId` có phải là thành viên của Booking này không (hoặc là `ADMIN`), nếu không sẽ throw lỗi `Không có quyền xem cuộc trò chuyện này`.
- Khi client đăng ký lắng nghe `/topic/location.booking.{bookingId}` (Kênh chia sẻ Vị trí GPS):
  - Kiểm tra tương tự như kênh Chat, chỉ cho phép người trong cuộc hẹn (Khách & Companion) được thấy vị trí trực tiếp của nhau để tính toán tính năng khoảng cách check-in.
- Khi đăng ký `/topic/notifications.user.{userId}` (Kênh Thông báo cá nhân):
  - Hệ thống kiểm tra `userId` được truyền vào trong topic có trùng khớp với ID của người dùng đang đăng nhập không để đảm bảo sự riêng tư của thông báo cá nhân.

## 3. Bộ Máy Phát Tín Hiệu (`RealtimeBroadcastService.java`)
Service này chịu trách nhiệm biến các thao tác thành tín hiệu realtime đẩy về Frontend thông qua `SimpMessagingTemplate`:
- `publishChatMessage(ChatMessage msg)`: Đẩy dữ liệu tin nhắn mới vảo kênh `/topic/chat.booking.[bookingId]`. Frontend nào đang subscribe kênh này sẽ lập tức nhận được tin và render ra giao diện.
- `publishNotification(Notification n)`: Đẩy notification mới có chứa `title`, `content`, `isRead` vào kênh `/topic/notifications.user.[userId]`. Update lại chuông thông báo màu đỏ cho user mà không cần load lại trang.
- `publishBookingLiveLocation(long bookingId, Map payload)`: Tín hiệu đồng bộ vị trí trực tiếp.

## 4. Các REST Controllers Cung Cấp Dữ Liệu Lịch Sử
Dù dùng WebSocket để truyền thời gian thực thay vì gọi API liên tiếp, ứng dụng vẫn cung cấp các REST API cho mục đích tải dữ liệu khi mới vừa mở trang:
- **`ChatController.java`**: 
  - `GET /api/chat/{bookingId}/messages`: Lấy lịch sử chat cũ trước đó.
  - `POST /api/chat/{bookingId}/messages`: Gửi tin nhắn mới (sau khi lưu Database, service sẽ gọi qua `RealtimeBroadcastService` để thông báo realtime).
  - Có thêm API tạo Call (thoại/video) thông qua `GET /api/chat/{bookingId}/call`.
- **`NotificationController.java`**:
  - `GET /api/.../notifications/me`: Lấy danh sách lịch sử thông báo chưa đọc / đã đọc của từng role riêng biệt (Customer, Companion, Admin).
  - `PATCH /api/.../notifications/{id}/read` & `read-all`: Đánh dấu đã đọc.

---
### Tóm gọn luồng chạy (Data Flow) cho Tính năng Chat:
1. User mở trình duyệt và kết nối Stomp qua SockJS tới `/ws`.
2. Trình duyệt gửi request `SUBSCRIBE` tới `/topic/chat.booking.1`.
3. `StompSubscribeInterceptor` kiểm tra User kia có đúng là người trong `booking = 1` hay không, nếu OK cho phép subscribe.
4. Một User gửi tin nhắn API `POST` tới `ChatController`.
5. Code Java lưu dòng tin nhắn vào Database, tiếp tục gọi `RealtimeBroadcastService` phát đi Message đó hướng tới `/topic/chat.booking.1`. 
6. Chỉ các trình duyệt đã Subscribe nó mới nhảy thông báo realtime nhận được tin nhắn.
