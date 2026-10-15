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
    buildNumber: '2',
    otaVersion: '20261016.01',
    releaseDate: '16/10/2026',
    title: 'Icon ứng dụng Light/Dark & Hoàn thiện giao diện',
    badge: 'Mới nhất',
    changes: [
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
