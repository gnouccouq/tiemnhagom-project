# Tiệm Nhà Gốm — Workspace Design Rules & UI/UX Standards

Tài liệu này là **Bộ quy chuẩn thiết kế UI/UX bắt buộc** cho toàn bộ dự án Tiệm Nhà Gốm (bao gồm `tiemnhagom-app` và hệ thống Web).
Mọi Agent/AI khi làm việc trên bất kỳ máy tính hoặc thiết bị nào **phải luôn tuân thủ 100% các quy tắc dưới đây**.

---

## 1. Quy chuẩn Header (Thanh đầu trang)
* **Tuyệt đối không có vạch kẻ ngang đáy (`borderBottomWidth: 0`):**
  * Không dùng `borderBottomWidth`, `borderBottomColor` (hoặc divider đen/xám) ngăn cách header với phần nội dung.
  * Nền Header phải tiệp màu hoàn toàn với nền màn hình (`#FAF8F5` / `Colors.background`), tạo cảm giác thoáng đãng, liền mạch và mượt mà khi cuộn hoặc chuyển cảnh (giống như Header trang Cài đặt - `settings.tsx` và trang Hồ sơ - `profile.tsx`).
* **Nút điều hướng trên Header:**
  * Các nút icon (Quay lại, Cài đặt, Thông báo, Tìm kiếm...) phải là nút tròn đều `width: 40px, height: 40px, borderRadius: 20px`, nền trắng `#FFFFFF` (hoặc `Colors.cardBackground`), viền nhẹ `borderColor: '#E8E1D8'`, đổ bóng nhẹ (`elevation: 2, shadowOpacity: 0.06`).

---

## 2. Quy chuẩn Input & Form (Thừa hưởng từ trang Login)
* **Dạng viên thuốc (Pill shape):**
  * Chiều cao chuẩn: `height: 52px`.
  * Bo góc tròn tuyệt đối: `borderRadius: 26px`.
  * Padding: `paddingHorizontal: 18px` đến `20px`.
  * Phông chữ: `fontFamily: 'ElleGaborStd'`, cỡ chữ `14px - 15px`.
  * Màu nền: `#FAF8F5` hoặc `Colors.surface`, viền `1px` màu men gốm `#E8E1D8`.
  * Ô nhập nhiều dòng (Text Area / Địa chỉ chi tiết): `minHeight: 84px`, bo góc mềm `borderRadius: 20px`.
* **Trường chọn (Selectors / Dropdowns / Khu vực giao hàng):**
  * Cũng phải tuân thủ dạng viên thuốc: `height: 52px, borderRadius: 26px`.

---

## 3. Quy chuẩn Button & Call-To-Action (CTA)
* **Primary Button (Nút hành động chính - CTA):**
  * Dạng viên thuốc: `height: 52px, borderRadius: 26px`.
  * Nổi khối cao cấp: `shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 8, elevation: 4`.
  * Chữ: `fontFamily: 'ElleGaborStd'`, `fontSize: 15px - 16px`, `fontWeight: '700'`.
  * Icon đi kèm: Đặt sát chữ (mũi tên `arrow-forward`, checkmark,...) để định hướng hành động.
* **Secondary / Pill Buttons (Nút phụ, chip phân loại, toggle):**
  * Dạng viên thuốc nhỏ gọn: `height: 38px - 44px`, `borderRadius: 19px - 22px`.
  * Nền trắng hoặc trong suốt viền mảnh `1px - 1.2px` tinh tế.
* **Độ nảy & Phản hồi khi chạm (Micro-interactions):**
  * Mọi nút bấm phải có phản hồi mượt: `activeOpacity={0.8 - 0.88}` hoặc sử dụng `ScalePressable`.

---

## 4. Quy chuẩn Bố cục & Khối Card (Thừa hưởng từ trang Profile)
* **Khối Card bo tròn 20px (`borderRadius: 20px`):**
  * Mọi nội dung liên quan phải được gom gọn gàng vào các thẻ Card bo cong tròn `20px`.
  * Nền Card: `#FFFFFF` (hoặc `Colors.cardBackground`), viền nhẹ `borderColor: '#E8E1D8'`, bóng mờ êm dịu (`shadowOpacity: 0.04, shadowRadius: 6, elevation: 2`).
  * Khoảng cách hai bên lề: `paddingHorizontal: 16px`. Khoảng cách giữa các khối Card: `14px - 16px`.
* **Tiêu đề phân khu (Section Header):**
  * Chữ `fontFamily: 'ElleGaborStd'`, `fontSize: 16px - 17px`, `fontWeight: '700'`, màu gốm trầm `#231B15`.
* **Danh sách hàng trong Card (List rows):**
  * Icon đặt trong vòng tròn màu pastel nhẹ `width: 38px - 44px`.
  * Phân cách giữa các hàng bằng divider mờ nhẹ `#F0ECE6` hoặc hairlineWidth.

---

## 5. Màu sắc & Tinh thần Thương hiệu (Brand Identity)
* **Nền tổng thể (Background):** Kem gốm ấm mộc mạc `#FAF8F5`.
* **Màu chữ chính (Text Primary):** Nâu đen gốm trầm `#231B15`.
* **Màu chữ phụ (Text Secondary / Muted):** `#6E665D` / `#9E968D`.
* **Viền tiêu chuẩn (Borders):** Men gốm `#E8E1D8`.
* **Điểm nhấn (Accents):**
  * Men xanh rêu: `#4A6B53`.
  * Men rêu sẫm / Olive: `#7B8854`.
  * Men vàng gốm: `#D89E3A`.
  * Đất nung / Terracotta: `#C86432`.
