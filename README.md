# 🏺 Tiệm Nhà Gốm — Dự Án Nền Tảng Thương Mại Gốm Sứ Thủ Công

> Website chính thức: [tiemnhagom.vn](https://tiemnhagom.vn) | Firebase: [tiemnhagom-project.web.app](https://tiemnhagom-project.web.app)

Nền tảng thương mại điện tử kết hợp ứng dụng di động dành riêng cho thương hiệu **Tiệm Nhà Gốm** — chuyên các sản phẩm gốm sứ thủ công mỹ nghệ, decor không gian sống và hoa nghệ thuật.

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

- **Frontend Web**: HTML5, Vanilla CSS3 (Custom Design System, Typography thương hiệu `Elle Gabor Std Light`), JavaScript ES Modules.
- **Backend & Cloud Database**: 
  - **Firebase Firestore**: Cơ sở dữ liệu thời gian thực (Sản phẩm, đơn hàng, khách hàng, voucher, kho hàng).
  - **Firebase Authentication**: Đăng nhập tài khoản, Google Auth, SĐT & OTP.
  - **Firebase Storage**: Lưu trữ hình ảnh sản phẩm chất lượng cao, ảnh feedback.
  - **Firebase Cloud Functions**: Xử lý logic chia sẻ link (`/share`), thông báo, webhook.
  - **Firebase Hosting**: Triển khai CDN toàn cầu tốc độ cao kèm custom domain SSL.
- **Mobile Application**: Capacitor (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`) đóng gói ứng dụng Android/iOS trực tiếp từ source web.
- **Tối ưu & Tích hợp**:
  - Google Analytics / GTM: `G-4FNKRZ13JC`
  - Speculation Rules API: Tải trước trang ngầm giúp trải nghiệm chuyển trang tức thì.
  - AI Decor Match: Gợi ý phối cảnh nội thất tự động theo từng món đồ gốm.

---

## 📂 Cấu Trúc Thư Mục Dự Án

```text
tiemnhagom-project/
├── Asset/                     # Tài nguyên tĩnh: fonts (Elle Gabor), hình ảnh, icons
├── css/                       # Hệ thống stylesheets
│   ├── style.css              # Style dùng chung toàn trang (Navbar, Footer, Buttons, Theme)
│   └── product-detail-v2.css  # Giao diện trang chi tiết sản phẩm thế hệ mới (V2)
├── js/                        # Các module JavaScript xử lý logic
│   ├── main.js                # Logic trang chủ (Hero, Banner, Flash sale)
│   ├── product-detail-v2.js   # Logic trang chi tiết V2 (Biến thể, giá, giỏ hàng, tab, sticky)
│   ├── utils.js               # Thư viện tiện ích (Render card, định dạng tiền tệ, xử lý giỏ hàng)
│   └── DashBoard.js           # Logic trung tâm điều hành quản trị viên
├── components/                # Thành phần giao diện tái sử dụng (Header, Footer, Dialogs)
├── product/                   # Trang chi tiết sản phẩm (/product/?id=...)
├── products/                  # Danh mục sản phẩm & bộ lọc tìm kiếm
├── cart/                      # Giỏ hàng & luồng thanh toán (Checkout, ship, voucher)
├── chinh-sach/                # Trung tâm chính sách & pháp lý (/chinh-sach/)
├── DashBoard/                 # Cổng quản trị POS & Quản lý bán hàng (/DashBoard/)
├── profile/                   # Thông tin tài khoản, lịch sử đơn & tích điểm hội viên
├── login/                     # Đăng nhập & Xác thực người dùng
├── lookbook/                  # Bộ sưu tập ảnh sản phẩm theo concept
├── tra-cuu-don-hang.html      # Tra cứu trạng thái đơn hàng công khai theo SĐT/Mã đơn
├── sitemap.xml & robots.txt   # Cấu hình chuẩn SEO cho Google Search Console
├── firebase.json              # Cấu hình định tuyến, redirect và rules Firebase
└── capacitor.config.json      # Cấu hình App di động Capacitor
```

---

## 🚀 Hướng Dẫn Vận Hành & Lệnh Thường Dùng

### 1. Chạy thử nghiệm trên máy cục bộ (Local Run)
Vì dự án dùng JavaScript ES Modules và Firebase, khuyến khích mở web qua một Local Web Server:
- **VS Code / IDE**: Nhấn chuột phải vào `index.html` chọn **Open with Live Server**.
- **Hoặc qua dòng lệnh (Node.js)**:
  ```bash
  npx serve .
  # Truy cập http://localhost:3000
  ```

### 2. Triển khai (Deploy) lên Firebase Hosting
Sau khi chỉnh sửa code và kiểm tra kỹ, chạy lệnh:
```bash
# Chỉ deploy giao diện Web lên Firebase Hosting (Khuyên dùng)
firebase deploy --only hosting

# Deploy toàn bộ (Rules Firestore, Storage, Cloud Functions)
firebase deploy
```

### 3. Đồng bộ lên GitHub
```bash
git add .
git commit -m "feat/fix: mô tả nội dung cập nhật"
git push origin main
```

### 4. Build ứng dụng di động (Android)
```bash
# Đồng bộ thay đổi web vào thư mục android
npx cap sync

# Mở dự án trong Android Studio để build file APK / Release
npx cap open android
```

---

## 📌 Các Đường Dẫn Quan Trọng

- **Trang chủ**: `https://tiemnhagom.vn/`
- **Cửa hàng sản phẩm**: `https://tiemnhagom.vn/products/`
- **Trang chi tiết sản phẩm**: `https://tiemnhagom.vn/product/?id=TNGCB01`
- **Quản trị viên (Admin)**: `https://tiemnhagom.vn/DashBoard/` *(Cần tài khoản có quyền Admin trong Firestore)*
- **Tra cứu vận đơn**: `https://tiemnhagom.vn/tra-cuu-don-hang.html`
