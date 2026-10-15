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

## 5. Màu sắc & Tinh thần Thương hiệu (Brand Identity — Trích xuất từ Brand Guidelines PDF)
Bảng màu quy chuẩn chính thức của Tiệm Nhà Gốm được quy định nghiêm ngặt từ tài liệu `TiemNhaGom_Brand Guideline.pdf` (Màu sắc Logo & Nhận diện):

### 5.1. Bảng màu Logo & Nhận diện Thương hiệu Chuẩn (Official Brand Palette):
* **`#9C7156` — Nâu Đất Nung / Gốm Mộc (Primary Terracotta Brand Color):**
  * Màu đại diện cốt lõi của thương hiệu Tiệm Nhà Gốm.
  * Sử dụng cho: Logo chính thức, nét vẽ biểu tượng chiếc bình gốm (Elements & Pattern), các nút nhấn CTA, icon nổi bật, tiêu đề nhấn mạnh.
* **`#2B2928` — Nâu Đen Than Chì / Gốm Trầm (Deep Charcoal Earth — Text Primary):**
  * Màu nhận diện phiên bản tối và màu chữ chuẩn.
  * Sử dụng cho: Chữ chính (Text Primary), heading cao cấp, logo trên nền sáng cần độ tương phản cao tuyệt đối.
* **`#F6F4EC` — Kem Gốm Mộc Sáng (Official Brand Cream / Canvas Background):**
  * Màu nền chủ đạo theo đúng tiêu chuẩn Brand Guidelines.
  * Sử dụng cho: Nền toàn bộ màn hình, canvas hiển thị, nền tổng thể app và web (thay thế hoặc phối hợp hài hòa cùng `#FAF8F5`).
* **`#E8CCB2` — Men Gốm Be Ấm (Warm Ceramic Sand / Secondary Beige):**
  * Màu đệm trung gian mang sắc thái men gốm tự nhiên.
  * Sử dụng cho: Nền badge, chip phân loại, viền border mềm mại, nền khối card phụ, họa tiết gốm.
* **`#FFFFFF` — Trắng Men Tinh Khiết (Pure Glaze White):**
  * Sử dụng cho: Nền các khối Card bo tròn 20px, nút bấm nổi, màu chữ/icon khi đặt trên nền nâu đất nung `#9C7156` hoặc nền tối `#2B2928`.

### 5.2. Các quy tắc cấm khi áp dụng nhận diện thương hiệu (Trang 6 Brand Guidelines):
* **Tuyệt đối không dùng màu khác ngoài bảng màu Brand:** Giữ trọn vẹn tinh thần gốm thủ công mộc mạc, tránh dùng các màu quá tươi, màu neon hoặc các dải màu lệch khỏi bảng mã màu quy chuẩn.
* **Bảo toàn tính tương phản:** Không đặt logo hoặc chữ trên nền màu không đủ độ tương phản; không đặt logo trực tiếp lên ảnh chụp có nhiều chi tiết gây rối mắt.
* **Không làm biến dạng logo:** Không xoay méo, không đổ bóng đậm (drop shadow) lên logo, không cắt xén, không tạo viền outline thô kệch.

### 5.3. Màu bổ trợ & Điểm nhấn giao diện (UI Functional Accents):
* **Tuyệt đối KHÔNG sử dụng màu xanh (xanh lá, xanh rêu, xanh lam, olive):** Nghiêm cấm sử dụng các màu xanh trong toàn bộ giao diện app và web.
* **Màu chữ phụ (Text Secondary / Muted):** `#6E665D` / `#9E968D`.
* **Viền tiêu chuẩn giao diện:** `#E8E1D8` / `#E8CCB2`.
* **Trạng thái Thành công / Tích điểm / Đơn hoàn tất:** Sử dụng màu Nâu Đất Nung `#9C7156`, Men Be `#E8CCB2` hoặc Nâu Trầm `#2B2928` để biểu thị, thay thế hoàn toàn cho màu xanh.

---

## 6. Quy chuẩn Giao diện Dark Mode (Lấy chuẩn từ trang Stores — `app/stores.tsx`)
Giao diện Dark Mode phải được thiết kế rõ ràng, tương phản tốt, không bị thô ráp hay chói mắt, sử dụng tông màu Đen Sâu OLED thuần khiết:

### 6.1. Bảng màu & Bố cục Dark Mode:
* **Màu nền toàn trang:** `#000000` (Pure Black OLED — `Colors.background`).
* **Màu nền Card View:** `#121212` (`Colors.cardBackground`), nổi khối thanh thoát trên nền đen sâu.
* **Màu nền Surface phụ / Icon Circle / Chip không active:** `#1E1E1E` (`Colors.surface`).
* **Màu chữ chính:** `#F5F5F5` (`Colors.textPrimary`), chữ phụ `#B0B0B0` / `#9E968D`, điểm nhấn men gốm `#E8CCB2` hoặc `#9C7156`.
* **Đường kẻ phân cách (Divider):** `#222222` (`Colors.divider`).

### 6.2. Quy tắc Viền (Border) & Nút Back ở Dark Mode:
* **Tuyệt đối KHÔNG có viền trắng / xám sáng xung quanh các khối Card:**
  * Toàn bộ Card View ở Dark Mode phải bỏ viền cứng hoặc đặt viền trong suốt: `borderWidth: isDark ? 0 : 1`, `borderColor: isDark ? 'transparent' : ...`.
  * Tắt shadow sáng màu (`shadowOpacity: isDark ? 0 : ...`, `elevation: isDark ? 0 : ...`).
* **Nút Back (và nút icon tròn trên Header):**
  * Bỏ viền trắng sáng xung quanh (`borderWidth: isDark ? 0 : ...`, `borderColor: 'transparent'`).
  * Đổi màu nền nút tròn sang màu đồng nhất với Card View: `backgroundColor: isDark ? (Colors.cardBackground || '#121212') : ...`.
  * Tắt hoàn toàn shadow trắng để không tạo cảm giác viền phát sáng lem luốc.
* **Thẻ / Chip đang được chọn (Active State):**
  * Nền chuyển sang `#1E1E1E` (hoặc `#121212`), viền bằng màu Nâu Đất Nung `#9C7156` (`borderWidth: 1.2, borderColor: '#9C7156'`). Tuyệt đối không dùng viền trắng hay viền đen chìm.

---

## 7. Quy chuẩn Đa ngôn ngữ (i18n & Localization Bắt buộc)
* **Bắt buộc 100% giao diện phải hỗ trợ đa ngôn ngữ:**
  * Mọi màn hình (Screens), khối thành phần (Components), hộp thoại (Dialog / Alert / Modal), trạng thái rỗng (Empty State), nhãn nút (Buttons) và chuỗi hiển thị cho người dùng **phải luôn được lấy từ `const { t } = useSettings()` với `t('key')`**.
  * **Nghiêm cấm để chuỗi tiếng Việt cứng (hardcoded text)** trong JSX hoặc trong logic phản hồi người dùng.
  * Mọi từ khóa (key) mới khi tạo ra **bắt buộc phải được định nghĩa đồng bộ đầy đủ ở cả 3 tệp từ điển**:
    * `src/locales/vi.ts` (Tiếng Việt chuẩn gốm thủ công)
    * `src/locales/en.ts` (Tiếng Anh tự nhiên, chuẩn mực)
    * `src/locales/zh.ts` (Tiếng Trung giản thể chuẩn xác)
  * Bảo toàn tính nhất quán về thuật ngữ thương hiệu:
    * Tiệm Nhà Gốm: Tiem Nha Gom / 陶舍
    * Điểm tích lũy / Điểm gốm: Pottery Points / 陶瓷积分
    * Gốm Mộc / Gốm Nung / Gốm Men / Gốm Độc Bản: Đồng bộ tên hạng hội viên ở mọi ngôn ngữ
    * Voucher / Kho quà: Vouchers & Rewards / 优惠券与礼品


