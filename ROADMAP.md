# 🗺️ Kế Hoạch Phát Triển — Tiệm Nhà Gốm (Project Roadmap)

Tài liệu này theo dõi tiến độ phát triển, kế hoạch nâng cấp tính năng và định hướng kỹ thuật cho toàn bộ hệ thống của **Tiệm Nhà Gốm**.

---

## 🚦 Trạng Thái Tổng Quan

- **Giai đoạn hiện tại**: **Phase 2 — Nâng Cao Trải Nghiệm Mua Hàng & Chuyển Đổi**
- **Phiên bản hiện hành**: `v2.1.0` (Chi tiết sản phẩm mới & đồng bộ thương hiệu)
- **Mục tiêu ưu tiên**: Tối ưu luồng thanh toán QR Code, thông báo đơn hàng tức thì và nén ảnh tốc độ cao.

---

## 📦 Phase 1: Xây Dựng Nền Tảng Cốt Lõi (ĐÃ HOÀN THÀNH ✅)

- [x] **Trang chủ & Thương hiệu**: Bố cục chuẩn gốm mộc, câu chuyện thương hiệu, banner flash sale, feedback khách hàng.
- [x] **Trang chi tiết sản phẩm V2**:
  - [x] Font chữ đồng bộ thương hiệu `Elle Gabor Std Light`.
  - [x] Bộ chọn biến thể trực quan (Màu men, họa tiết, combo).
  - [x] Bảng giá sản phẩm, tem giảm giá và quyền lợi giá hội viên.
  - [x] Khối cam kết 5 lớp chuẩn gốm với icon vector SVG tối giản, không giật màu khi hover.
  - [x] Hệ thống Tab thông tin: Mô tả, Thông số kỹ thuật & An toàn lò vi sóng, Cẩm nang bảo quản, Đánh giá thực tế.
  - [x] Thanh mua hàng ghim chân trang (Sticky bottom bar) trên di động và khi cuộn trang.
- [x] **Giỏ hàng & Đặt hàng cơ bản**:
  - [x] Thêm/bớt số lượng sản phẩm, lưu giỏ hàng vào LocalStorage.
  - [x] Bảng tính phí vận chuyển theo khu vực (Nội thành HCM 20k, Hỏa tốc 2h 30k, Toàn quốc 40k).
  - [x] Hệ thống áp dụng mã giảm giá / coupon voucher.
- [x] **Trung tâm điều hành Admin & POS**:
  - [x] Dashboard quản trị sản phẩm, biến thể, giá bán, tồn kho.
  - [x] Quản lý đơn hàng, đổi trạng thái giao hàng, in hóa đơn.
  - [x] POS bán hàng trực tiếp tại quầy tiệm.
- [x] **Công cụ tra cứu công khai**:
  - [x] Trang `tra-cuu-don-hang.html` tìm nhanh trạng thái đơn theo SĐT hoặc mã đơn.
- [x] **Deploy Hosting & Custom Domain**:
  - [x] Đưa website lên domain chính thức `https://tiemnhagom.vn` qua Firebase Hosting.

---

## ⚡ Phase 2: Tối Ưu Trải Nghiệm & Tăng Tỉ Lệ Chuyển Đổi (ĐANG TRIỂN KHAI 🔄)

### 1. Thanh toán & Xác nhận đơn hàng thông minh
- [ ] **Mã QR chuyển khoản tự động (VietQR)**: Tạo mã QR ngân hàng kèm sẵn số tiền và mã đơn hàng sau khi khách nhấn Đặt hàng, giúp khách quét thanh toán không cần nhập tay.
- [ ] **Thông báo đơn hàng tức thì (Instant Alert)**:
  - Tích hợp thông báo qua **Telegram Bot** hoặc **Zalo OA** gửi tin nhắn ngay cho chủ tiệm khi có đơn đặt mới từ web.
  - Gửi email xác nhận đơn hàng tự động cho khách.

### 2. Tối ưu hiệu năng & Hình ảnh
- [ ] **Chuyển đổi ảnh sang WebP**: Giảm 60–80% dung lượng ảnh sản phẩm tải từ Firebase Storage, giúp khách lướt web mượt mà ngay cả khi mạng 3G/4G yếu.
- [ ] **Bộ lọc sản phẩm nâng cao (`products/`)**:
  - Lọc theo khoảng giá (Dưới 100k, 100k–300k, trên 500k).
  - Lọc theo công năng (Đồ dùng bàn ăn, Bình hoa decor, Quà tặng gốm).
  - Lọc theo màu sắc men gốm.

### 3. Nâng cấp giao diện Giỏ hàng (`cart/`)
- [ ] Đồng bộ phong cách thiết kế sang trọng, tối giản như trang chi tiết V2.
- [ ] Thanh tiến trình "Freeship" (Ví dụ: *Mua thêm 150.000đ để được Freeship toàn quốc*).

---

## 🌟 Phase 3: Khách Hàng Thân Thiết & Mở Rộng Hệ Sinh Thái (KẾ HOẠCH TIẾP THEO 📋)

- [ ] **Hệ thống Hội Viên Tiệm Nhà Gốm (Loyalty Tier)**:
  - Tích điểm tự động theo số điện thoại khi mua online hoặc tại quầy.
  - Hạng: Đồng (Bronze), Bạc (Silver), Vàng (Gold), Kim Cương (Diamond) với chiết khấu tự động.
  - Tặng voucher tự động vào ngày sinh nhật khách hàng.
- [ ] **Cổng thanh toán tự động**: Tích hợp VNPAY / MoMo / ZaloPay hoàn tất thanh toán trong 1 chạm.
- [ ] **Xuất bản ứng dụng di động hoàn thiện**:
  - Đóng gói file APK/AAB chuẩn bị phát hành lên Google Play Store và App Store.
  - Tính năng nhận thông báo đẩy (Push Notifications) về flash sale và lịch giao hàng.
- [ ] **Chuyên trang Blog & Văn hóa gốm sứ**:
  - Viết bài chia sẻ cách cắm hoa, phối gốm phong thủy, phân biệt các dòng men cổ truyền.
  - Tăng mạnh lượng truy cập tự nhiên (Organic Traffic) từ Google SEO.

---

## 📝 Quy Ước Cập Nhật Kế Hoạch

1. Khi bắt đầu làm tính năng mới: Đánh dấu `[ ]` và ghi chú ngày bắt đầu.
2. Khi tính năng đã test kỹ và deploy thành công: Đánh dấu `[x]` và cập nhật số phiên bản tương ứng.
3. Khi phát sinh lỗi hoặc yêu cầu đột xuất: Thêm mục cần xử lý vào phần **Hotfix / Backlog** để không bị bỏ sót.
