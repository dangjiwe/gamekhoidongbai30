# 🐞 TRUY TÌM BUG - KIỂM THỬ & GỠ LỖI (Tin học 10 - Bài 30)

Ứng dụng web realtime (dạng Kahoot/Quizizz thu nhỏ chạy qua mạng LAN cục bộ) phục vụ hoạt động khởi động **Bài 30: Kiểm thử và gỡ lỗi chương trình** — Môn Tin học 10.

---

## 📁 Cấu trúc thư mục

```text
gamekhoidong/
├── package.json         # Khai báo các thư viện: express, socket.io, qrcode, ip
├── server.js            # Máy chủ Node.js + Express + Socket.IO + Bộ câu hỏi mẫu
└── public/
    ├── host.html        # Giao diện màn hình Giáo viên (trình chiếu máy chiếu)
    ├── host.js          # Xử lý realtime, biểu đồ, so sánh code, bảng xếp hạng
    ├── player.html      # Giao diện màn hình Học sinh (trên điện thoại/máy tính)
    ├── player.js        # Xử lý đăng nhập, chọn đáp án 1 lần, xem kết quả & ghi chép
    └── style.css        # Giao diện Glassmorphism, IDE Python, Sơ đồ chu trình 3 nút
```

---

## 🚀 Hướng dẫn cài đặt và chạy trên máy Giáo viên

### Bước 1: Cài đặt thư viện
Mở **Terminal** (hoặc PowerShell / Command Prompt) tại thư mục dự án và chạy:

```bash
npm install
```

### Bước 2: Khởi động máy chủ
```bash
node server.js
```
*(hoặc `npm start`)*

Khi khởi động thành công, Terminal sẽ hiển thị địa chỉ truy cập:
- **Màn hình Giáo viên (Host):** `http://localhost:3000/host` (hoặc `/teacher`)
- **Link Học sinh tham gia (LAN):** `http://<IP_LAN>:3000/join`

### Bước 3: Chiếu lên máy chiếu & Học sinh tham gia
1. Giáo viên mở trình duyệt trên máy tính nối với máy chiếu tại địa chỉ: `http://localhost:3000/host` (nhấn `F11` để toàn màn hình).
2. Học sinh kết nối điện thoại vào **cùng mạng Wi-Fi / LAN** với máy tính của giáo viên, dùng Camera quét **Mã QR** trên màn hình chiếu (hoặc nhập trực tiếp địa chỉ `http://<IP_LAN>:3000/join`).
3. Nếu máy tính của giáo viên có nhiều card mạng (ví dụ cài thêm VirtualBox/VMware), giáo viên có thể chọn đúng địa chỉ IP Wi-Fi ở mục **"Đổi card mạng LAN"** ngay dưới mã QR.
