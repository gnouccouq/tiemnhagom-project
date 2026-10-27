// src/constants/changelog.ts

export interface ReleaseChange {
  title: string;
  description: string;
}

export interface ReleaseVersion {
  version: string;
  buildNumber: string;
  otaVersion: string;
  releaseDate: string;
  title: string;
  badge?: string;
  changes: ReleaseChange[];
}

export const CHANGELOG_HISTORY: ReleaseVersion[] = [
  {
    version: '1.0.1',
    buildNumber: '3',
    otaVersion: '20261025.01',
    releaseDate: '25/10/2026',
    title: 'Liquid Glass Toàn Diện, Gói Quà Miễn Phí & Nâng Cấp Trải Nghiệm Mua Sắm',
    badge: 'Mới nhất',
    changes: [
      {
        title: 'Hiển thị tràn viền & Thanh đáy nổi Liquid Glass toàn ứng dụng',
        description: 'Đồng bộ giao diện tràn viền 100% và bọc hiệu ứng kính khúc xạ LiquidGlass dạng viên thuốc nổi dưới đáy cho toàn bộ các trang (Giỏ hàng, Chi tiết sản phẩm, Thanh toán, Chi tiết đơn hàng...).',
      },
      {
        title: 'Gói quà miễn phí & Viết thiệp tay nghệ nhân',
        description: 'Bổ sung tuỳ chọn gói quà mộc mạc miễn phí kèm ô nhập lời chúc viết tay tại bước Thanh toán.',
      },
      {
        title: 'Phối cùng bộ gốm đồng điệu & Thiệp chia sẻ tác phẩm',
        description: 'Gợi ý phối trọn bộ gốm cùng danh mục ngay trên trang Chi tiết sản phẩm và tạo thiệp ảnh nghệ thuật để lưu hoặc chia sẻ nhanh.',
      },
      {
        title: 'Đánh giá kèm hình ảnh thực tế (+20 Điểm Gốm) & Đặt lại đơn nhanh',
        description: 'Hỗ trợ đính kèm ảnh chụp sản phẩm khi đánh giá đơn hàng nhận thưởng Điểm Gốm và nút đặt lại toàn bộ giỏ hàng chỉ với 1 chạm.',
      },
      {
        title: 'Tác phẩm vừa ngắm & Phản hồi xúc giác Haptics',
        description: 'Lưu danh sách các món gốm vừa xem trong Giỏ hàng và tích hợp rung phản hồi xúc giác tinh tế trên mọi thao tác.',
      },
    ],
  },
  {
    version: '1.0.1',
    buildNumber: '2',
    otaVersion: '20261022.01',
    releaseDate: '22/10/2026',
    title: 'Phát hành bản dựng APK Android & Hệ thống OTA Update',
    changes: [
      {
        title: 'Tối ưu bản cài đặt Android APK độc lập',
        description: 'Tương thích trọn vẹn icon Material Symbols, cấu hình buildType APK trong EAS Build và ẩn nhãn chữ Bottom Bar tối giản.',
      },
      {
        title: 'Đồng bộ hệ thống OTA Update toàn diện',
        description: 'Tự động kiểm tra bản cập nhật tức thì qua đám mây EAS Update (kênh preview & production) khi mở ứng dụng.',
      },
      {
        title: 'Nâng cấp và đồng bộ trọn bộ module Expo SDK',
        description: 'Đồng bộ phiên bản Expo SDK 57, giải quyết triệt để cảnh báo tương thích và vượt qua 100% bài kiểm tra Expo Doctor.',
      },
    ],
  },
  {
    version: '1.0.1',
    buildNumber: '2',
    otaVersion: '20261018.01',
    releaseDate: '18/10/2026',
    title: 'Kiểm soát tồn kho phân loại & Cải tiến cập nhật OTA',
    changes: [
      {
        title: 'Kiểm soát tồn kho biến thể chính xác',
        description: 'Tự động báo hết hàng và vô hiệu hóa nút thêm vào giỏ hàng ngay khi phân loại biến thể có số lượng tồn kho về 0.',
      },
      {
        title: 'Đồng bộ cơ chế kiểm tra cập nhật OTA',
        description: 'Hiển thị chi tiết phiên bản OTA, kênh cập nhật (channel) và tình trạng nạp bản cập nhật Over-The-Air.',
      },
      {
        title: 'Hỗ trợ hiển thị phân loại Combo',
        description: 'Bổ sung danh sách chọn phân loại Combo quà tặng trong bảng chọn mua nhanh của sản phẩm.',
      },
    ],
  },
  {
    version: '1.0.1',
    buildNumber: '2',
    otaVersion: '20261016.01',
    releaseDate: '16/10/2026',
    title: 'Icon ứng dụng Light/Dark & Hoàn thiện giao diện',
    changes: [
      {
        title: 'Hệ thống Liquid Glass & Native Bottom Tabs iOS 26',
        description: 'Tích hợp mặt kính khúc xạ Apple, hiệu ứng lún đàn hồi, hòa quyện viền kính lỏng và thanh điều hướng nổi Native Tabs tự co nhỏ khi cuộn.',
      },
      {
        title: 'Icon ứng dụng theo chủ đề (iOS)',
        description: 'Tự động đổi icon Light Mode (nền sáng) và Dark Mode (nền tối) chuẩn phong cách gốm thủ công.',
      },
      {
        title: 'Logo chính thức Tiệm Nhà Gốm',
        description: 'Hiển thị logo nhận diện thương hiệu chính thức ở chân trang chủ thay thế chữ thuần túy.',
      },
      {
        title: 'Tối ưu modal chọn Tỉnh / Thành phố',
        description: 'Khắc phục hoàn toàn hiện tượng hở đáy, danh sách lấp đầy tự nhiên và cuộn mượt mà.',
      },
      {
        title: 'Tự động dừng video banner',
        description: 'Tự động tạm dừng phát video khi chuyển tab hoặc chuyển trang, tiết kiệm pin và tài nguyên thiết bị.',
      },
    ],
  },
  {
    version: '1.0.0',
    buildNumber: '1',
    otaVersion: '20261015.02',
    releaseDate: '15/10/2026',
    title: 'Đăng ký & Đăng nhập OTP chuẩn Web',
    changes: [
      {
        title: 'Đăng ký tối giản chuẩn Web',
        description: 'Đăng ký nhanh chóng chỉ với Email và Mật khẩu (tối thiểu 6 ký tự), tự động đồng bộ tên hiển thị.',
      },
      {
        title: 'Đăng nhập OTP 6 ô độc lập',
        description: 'Hỗ trợ đăng nhập số điện thoại với 6 ô số riêng biệt, bàn phím số tự động mở mượt mà và tự điền mã SMS.',
      },
      {
        title: 'Đồng bộ User ID & Đơn hàng',
        description: 'Tự động tra cứu và liên kết tài khoản cùng lịch sử đơn hàng cũ theo số điện thoại giống 100% bản Web.',
      },
    ],
  },
  {
    version: '1.0.0',
    buildNumber: '1',
    otaVersion: '20261015.01',
    releaseDate: '15/10/2026',
    title: 'Bản sửa lỗi & Nâng cấp hệ thống OTA',
    changes: [
      {
        title: 'Tối ưu form Đăng nhập',
        description: 'Tự động viết hoa chữ cái đầu cho các trường tài khoản, hiển thị email mẫu email@gmail.com trực quan.',
      },
      {
        title: 'Liên kết tài khoản Google thật',
        description: 'Cho phép liên kết và đồng bộ trực tiếp với tài khoản Google thực tế trong phần Cài đặt tài khoản.',
      },
      {
        title: 'Định dạng OTA đa phiên bản',
        description: 'Bổ sung mã định danh phụ (.01, .02) cho phép phát hành nhiều bản vá lỗi chuẩn xác trong cùng một ngày.',
      },
      {
        title: 'Lịch sử cập nhật chi tiết',
        description: 'Hiển thị đầy đủ nhật ký các phiên bản đã phát hành trước đó, giúp theo dõi cải tiến dễ dàng.',
      },
    ],
  },
  {
    version: '1.0.0',
    buildNumber: '1',
    otaVersion: '20261014',
    releaseDate: '14/10/2026',
    title: 'Thanh toán VietQR & Trải nghiệm giao diện',
    changes: [
      {
        title: 'Thanh toán VietQR chuẩn xác',
        description: 'Tự động tạo mã VietQR kèm số tiền và mã đơn hàng định danh Hộ Kinh Doanh Tiệm Nhà Gốm.',
      },
      {
        title: 'Lưu ảnh QR & Mở App Ngân hàng',
        description: 'Hỗ trợ lưu mã QR vào thư viện ảnh hoặc chuyển hướng nhanh sang ứng dụng ngân hàng để quét mã trong 3 giây.',
      },
      {
        title: 'Chia sẻ sản phẩm',
        description: 'Chia sẻ nhanh liên kết sản phẩm gốm mộc kèm thông tin qua Zalo, Facebook và các ứng dụng nhắn tin.',
      },
      {
        title: 'Splash Screen mượt mà',
        description: 'Tối ưu hiệu ứng khởi động ứng dụng với chuyển động zoom êm ái đúng chuẩn nhận diện thương hiệu.',
      },
    ],
  },
  {
    version: '1.0.0',
    buildNumber: '1',
    otaVersion: 'Bản gốc',
    releaseDate: '10/10/2026',
    title: 'Phát hành chính thức Ứng dụng Tiệm Nhà Gốm',
    changes: [
      {
        title: 'Bộ sưu tập gốm thủ công',
        description: 'Trải nghiệm mua sắm các tác phẩm gốm mộc, bình hoa men mờ, bộ chén đĩa thủ công tinh xảo.',
      },
      {
        title: 'Giỏ hàng & Theo dõi đơn hàng',
        description: 'Quản lý giỏ hàng thuận tiện, nhập mã ưu đãi và theo dõi trạng thái giao hàng tức thì.',
      },
      {
        title: 'Giao diện Sáng & Tối OLED',
        description: 'Hỗ trợ chế độ Sáng (Men Gốm Ấm) và Tối (OLED Trầm) đồng nhất theo ngôn ngữ thiết kế thương hiệu.',
      },
      {
        title: 'Đa ngôn ngữ & Thông báo',
        description: 'Hỗ trợ song ngữ Tiếng Việt - English và nhận thông báo cập nhật ưu đãi độc quyền.',
      },
    ],
  },
];
