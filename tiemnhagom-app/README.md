# 🏺 Tiệm Nhà Gốm Mobile App (React Native + Expo)

Ứng dụng Native di động chính thức của **Tiệm Nhà Gốm (Ceramics & Decor)**, được xây dựng trên nền tảng **React Native + Expo SDK 57**, sử dụng **Expo Router** và kết nối trực tiếp với **Firebase** dùng chung cơ sở dữ liệu với website [tiemnhagom.vn](https://tiemnhagom.vn).

---

## 📱 Khả năng tương thích
- **Android**: Chạy mượt mà trên điện thoại/máy tính bảng Android hoặc Expo Go.
- **iOS**: Chạy mượt mà trên iPhone/iPad hoặc ứng dụng Expo Go trên iOS.
- **Web**: Hỗ trợ chạy preview trên trình duyệt qua Metro Bundler.

---

## 🚀 Hướng dẫn khởi chạy

Chuyển vào thư mục app:
```bash
cd tiemnhagom-app
```

### 1. Khởi động Expo Server (Quét QR để chạy trên điện thoại thật)
```bash
npx expo start
```
- Mở camera điện thoại (iOS) hoặc app **Expo Go** (Android) quét mã QR hiển thị trong terminal để chạy app ngay lập tức.

### 2. Chạy trên máy ảo Android (Android Emulator)
```bash
npm run android
```

### 3. Chạy trên máy ảo iOS (iOS Simulator trên macOS)
```bash
npm run ios
```

### 4. Chạy xem thử nghiệm trên Web
```bash
npm run web
```

---

## 🔥 Kết nối Firebase (Dùng chung với Website)

Ứng dụng kết nối với Firebase Project **`tiemnhagom-project`**:
- **Cấu hình**: [`src/config/firebase.ts`](src/config/firebase.ts)
- **Firestore Collections kết nối trực tiếp**:
  - `products`: Danh mục sản phẩm gốm, giá bán, giảm giá, biến thể màu sắc, họa tiết, hình ảnh, tình trạng kho.
  - `orders`: Tạo đơn hàng mới từ app, tra cứu trạng thái đơn theo Số điện thoại hoặc Mã đơn `TNG-XXXXXX`.
  - `users`: Thông tin khách hàng, hạng thành viên (Đồng, Bạc, Vàng, Kim Cương), tích lũy điểm thưởng.
- **Firebase Auth**: Đăng nhập, đăng ký tài khoản thành viên với bảo mật phiên đăng nhập qua `@react-native-async-storage/async-storage`.

---

## 📂 Cấu trúc thư mục & Màn hình

```
tiemnhagom-app/
├── app/                              # Định tuyến Expo Router (File-based routing)
│   ├── (tabs)/                       # Điều hướng thanh TabBar 5 mục
│   │   ├── _layout.tsx               # Cấu hình thanh tab dưới cùng + Icon + Cart Badge
│   │   ├── index.tsx                 # Trang chủ (Banner, Danh mục, Ưu đãi, Bán chạy)
│   │   ├── products.tsx              # Cửa hàng (Tìm kiếm, Lọc danh mục, Sắp xếp giá)
│   │   ├── cart.tsx                  # Giỏ hàng (Tăng giảm SL, Chọn ship, Voucher)
│   │   ├── orders.tsx                # Tra cứu đơn hàng (Theo SĐT/Mã đơn & Đơn của tôi)
│   │   └── profile.tsx               # Tài khoản (Điểm tích lũy, Hạng TV, Hotline, Zalo)
│   ├── product/[id].tsx              # Chi tiết sản phẩm (Thư viện ảnh, Biến thể, Đặt mua)
│   ├── checkout.tsx                  # Thanh toán (Điền thông tin, Chọn COD/VietQR)
│   ├── order-success.tsx             # Đặt hàng thành công (Mã đơn, Mã QR VietQR)
│   ├── auth/login.tsx                # Đăng nhập & Đăng ký tài khoản
│   └── _layout.tsx                   # Layout gốc (AuthProvider, CartProvider, WishlistProvider)
├── src/
│   ├── components/                   # Các component giao diện chuẩn thương hiệu gốm
│   │   ├── BannerSlider.tsx          # Carousel banner bộ sưu tập
│   │   ├── CartItemCard.tsx          # Thẻ sản phẩm trong giỏ hàng với nút tăng giảm
│   │   ├── CategoryChip.tsx          # Nút bấm chọn danh mục
│   │   ├── EmptyState.tsx            # Trạng thái rỗng thân thiện
│   │   ├── Header.tsx                # Thanh tiêu đề trên cùng với logo & giỏ hàng
│   │   └── ProductCard.tsx           # Thẻ sản phẩm gốm (ảnh, giá, nhãn sale, yêu thích)
│   ├── config/
│   │   └── firebase.ts               # Cấu hình kết nối Firebase Firestore, Auth, Storage
│   ├── constants/
│   │   └── theme.ts                  # Design Tokens: Bảng màu đất nung mộc mạc, Typography, Spacing
│   ├── context/
│   │   ├── AuthContext.tsx           # Quản lý phiên đăng nhập & User Profile
│   │   ├── CartContext.tsx           # Quản lý giỏ hàng & lưu trữ AsyncStorage
│   │   └── WishlistContext.tsx       # Quản lý danh sách sản phẩm yêu thích
│   ├── services/
│   │   ├── productService.ts         # Service truy vấn sản phẩm Firestore
│   │   └── orderService.ts           # Service tạo & tra cứu đơn hàng Firestore
│   ├── types/
│   │   └── index.ts                  # Định nghĩa kiểu dữ liệu TypeScript
│   └── utils/
│       └── format.ts                 # Định dạng tiền tệ VND, ngày tháng, mã đơn
├── app.json                          # Cấu hình Expo, Bundle Identifier & Tên app
└── package.json                      # Danh sách thư viện và dependencies
```

---

## 🎨 Điểm nổi bật về Thiết kế & Trải nghiệm
- **Tone màu gốm mộc mạc**: Sử dụng màu đỏ đất nung (`#C86432`), nền kem ấm (`#FAF8F5`), nâu trầm sang trọng và điểm nhấn xanh rêu gốm mộc.
- **Trải nghiệm mượt mà**: Tối ưu hình ảnh với `expo-image` có bộ nhớ đệm (cache), cuộn êm ái trên cả iOS và Android.
- **Tra cứu đơn hàng không cần đăng nhập**: Khách hàng chỉ cần nhập Số điện thoại hoặc Mã đơn là có thể theo dõi trạng thái đóng gói và giao hàng.
- **Tích hợp thanh toán linh hoạt**: Hỗ trợ COD và thanh toán Chuyển khoản VietQR tự động tạo mã QR có sẵn số tiền và nội dung đơn.
