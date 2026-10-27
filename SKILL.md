---
name: tiemnhagom-standards
description: >-
  Bộ quy chuẩn thiết kế UI/UX và kiến trúc vận hành bắt buộc cho Tiệm Nhà Gốm.
  Bao gồm bảng màu men gốm, chuẩn thanh điều hướng Native iOS, Dark Mode OLED, đa ngôn ngữ i18n,
  chống tràn khung, quy trình POS, kết ca thu ngân và báo cáo doanh thu tài chính.
---

# Tiệm Nhà Gốm — Workspace Design Rules & UI/UX Standards

Tài liệu này là **Bộ quy chuẩn thiết kế UI/UX và Kiến trúc vận hành bắt buộc** cho toàn bộ dự án Tiệm Nhà Gốm (bao gồm `tiemnhagom-app`, `tiemnhagom-retail-app` và hệ thống Web Dashboard / POS).
Mọi Agent/AI khi làm việc trên bất kỳ máy tính hoặc thiết bị nào **phải luôn tuân thủ 100% các quy tắc dưới đây**.

---

## 1. Quy chuẩn Header (Thanh đầu trang)
* **Tuyệt đối không có vạch kẻ ngang đáy (`borderBottomWidth: 0`):**
  * Không dùng `borderBottomWidth`, `borderBottomColor` (hoặc divider đen/xám) ngăn cách header với phần nội dung.
  * Nền Header phải tiệp màu hoàn toàn với nền màn hình (`#FAF8F5` / `Colors.background`), tạo cảm giác thoáng đãng, liền mạch và mượt mà khi cuộn hoặc chuyển cảnh (giống như Header trang Cài đặt - `settings.tsx` và trang Hồ sơ - `profile.tsx`).
* **Nền Gradient trong suốt 80% mờ dần (Fading Backdrop Gradient):**
  * Áp dụng lớp phủ `LinearGradient` mờ dần từ trên xuống dưới (độ cao `height: statusBarHeight + 56 + 24`):
    * Light Mode: `['rgba(250,248,245,0.88)', 'rgba(250,248,245,0.75)', 'rgba(250,248,245,0.45)', 'rgba(250,248,245,0.15)', 'rgba(250,248,245,0)']`, locations: `[0, 0.40, 0.70, 0.88, 1]`.
    * Dark Mode: `['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0)']`.
  * **Cơ chế hiển thị trên trang có banner trong suốt (như Trang chủ — `transparent=true`):**
    * Khi ở đầu trang (`scrollY <= 5`), nền Header hoàn toàn trong suốt (`opacity: 0`) để lộ trọn vẹn banner hình ảnh phía sau.
    * Khi người dùng cuộn xuống (`scrollY > 5`), lớp nền gradient mới hiện dần dần (`opacity: progress` từ 0 đến 1) để bảo đảm độ tương phản đọc chữ hoàn hảo, không che mờ banner lúc ban đầu.
* **Nút điều hướng trên Header:**
  * Các nút icon (Quay lại, Cài đặt, Thông báo, Tìm kiếm...) phải là nút tròn đều `width: 40px, height: 40px, borderRadius: 20px`, nền trắng `#FFFFFF` (hoặc `Colors.cardBackground`), viền nhẹ `borderColor: '#E8E1D8'`, đổ bóng nhẹ (`elevation: 2, shadowOpacity: 0.06`).
* **Bố cục Header trang con có Huy hiệu Điểm Gốm / Action phụ:**
  * Bên trái: Luôn gom nút Back và Tiêu đề vào chung nhóm `headerLeftGroup` (`flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 8`) để tiêu đề hiển thị liền mạch cạnh nút quay lại.
  * Bên phải: Huy hiệu Điểm Gốm (`pointsBadge`) bo tròn viên thuốc 20px, hiển thị số điểm đậm màu `#9C7156` kèm icon chiếc bình gốm (`icon_ceramic_point.png` cỡ `18x18px`).
  * Cơ chế đồng bộ điểm: Luôn tính từ tổng chi tiêu đơn hàng từ `orderService.ts` kết hợp `userProfile.points` trừ điểm đã dùng, bảo đảm số điểm gốm luôn nhất quán với trang Ưu đãi (`deals.tsx`).
* **Khoảng cách thanh tìm kiếm Header Uniqlo (`searchPillWrapper`):**
  * Luôn đảm bảo `marginRight: 12px` trước nút chuông thông báo bên phải, và tách các thuộc tính layout (`margin`, `flex`) ra thẻ `Pressable` ngoài cùng khi dùng `ScalePressable` để tránh hiện tượng tràn width lấn sang icon bên cạnh.
* **Độ tương phản & Hiển thị chữ trong thanh tìm kiếm (`searchPlaceholder` & `searchInputInline`):**
  * Chữ và Placeholder phải đạt độ tương phản cao, sắc nét trên mọi nền ảnh/canvas: cỡ chữ `13.5px`, `fontWeight: '600'`.
  * Màu chữ & Icon tìm kiếm: Light Mode dùng Nâu Đen Than Chì `#2B2928` (placeholder `rgba(43, 41, 40, 0.70)`); Dark Mode dùng Trắng Sáng `#F5F5F5` (placeholder `rgba(245, 245, 245, 0.78)`).
* **Quy chuẩn Thanh Trạng Thái Hệ Thống (Status Bar Icons):**
  * Luôn tự động chuyển đổi theo chủ đề sáng / tối:
    * **Light Mode:** `barStyle="dark-content"` (chữ/biểu tượng giờ, pin, wifi hiển thị màu **ĐEN** sắc nét trên nền sáng).
    * **Dark Mode:** `barStyle="light-content"` (chữ/biểu tượng hiển thị màu **TRẮNG** trên nền đen sâu OLED).
  * Công thức chuẩn: `barStyle={isDark ? 'light-content' : 'dark-content'}` trên mọi màn hình có `StatusBar`.

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
  * Icon đi kèm: Đặt sát chữ (mũi tên `arrow-forward`, checkmark, icon download...) để định hướng hành động.
* **Hiển thị tràn viền toàn màn hình & Thanh hành động đáy nổi bọc Liquid Glass (Full-Bleed Screen & Floating Liquid Glass Bottom Action Bar):**
  * **Hiển thị Full-Bleed 100% tràn viền màn hình (Không có dải đen / khoảng cắt đáy):**
    * Tuyệt đối **không dùng `SafeAreaView`** bọc ngoài cùng các trang cuộn vì `SafeAreaView` sẽ cắt vùng `insets.bottom`, tạo ra dải nền đặc hoặc vệt đen cắt ngang dưới đáy màn hình.
    * Luôn dùng `<View style={{ flex: 1, backgroundColor: Colors.background }}>` kết hợp `contentInsetAdjustmentBehavior="never"` trên `ScrollView` / `FlatList` để nội dung cuộn xuyên suốt tràn xuống tận mép đáy màn hình phía sau lớp kính.
  * **Thanh hành động cố định đáy màn hình dạng viên thuốc nổi bọc Liquid Glass (`LiquidGlass` Floating Pill):**
    * Áp dụng cho toàn bộ các thanh CTA dưới đáy trang (như thanh "Tiến hành đặt hàng" ở `cart.tsx`, "Thêm vào giỏ & Mua ngay" ở `product/[id].tsx`, "Đặt hàng" ở `checkout.tsx`, nút "Áp dụng", "Xác nhận", "Kiểm tra bản cập nhật"...):
    * **Tuyệt đối không** dùng thanh chữ nhật đặc chạm sát đáy (`bottom: 0, left: 0, right: 0` với `backgroundColor` đặc hoặc `borderTopWidth`).
    * Đặt trong container nổi tách khỏi mép màn hình: `position: 'absolute', left: 14, right: 14, bottom: Math.max(insets.bottom, 14), zIndex: 100` kèm `pointerEvents="box-none"`.
    * Bọc toàn bộ nội dung thanh đáy trong `<LiquidGlass interactive={true} effect="regular" isDark={isDark} style={{ borderRadius: 36, overflow: 'hidden', ... }}>` (tự động dùng hiệu ứng khúc xạ kính thật của hệ thống iOS 26 và tự động fallback sang kính mờ `BlurView` + nền bán trong suốt đồng bộ trên Android / iOS cũ).
    * Trong `ScrollView` / `FlatList`, `contentContainerStyle` bắt buộc có `paddingBottom: Math.max(insets.bottom, 20) + 110` để nội dung cuối trang cuộn thoải mái lên trên thanh kính nổi.
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
* **Lưới Danh mục Không Gian Tuyển Chọn (Category Grid 3 Cột Chuẩn Mực):**
  * Chia đều 3 cột đối xứng (`width: '33.333%'`), `justifyContent: 'flex-start'`, `rowGap: 18px` để luôn giữ các hàng thẳng hàng, cân xứng, không bị dồn lệch hay để lại ô trống thừa thãi.
  * Icon tròn minh hoạ gốm (`width: 66px, height: 66px, borderRadius: 33px`): Đặt trên nền men kem mộc `#FAF7F2` / `#F6F4EC` viền nhẹ `#E8E1D8` (Light) hoặc `#1A1816` viền men be mảnh `rgba(232, 204, 178, 0.22)` (Dark).
  * Tên danh mục (`curatedItemName`): `fontFamily: 'ElleGaborStd'`, cỡ chữ `12.5px`, `fontWeight: '600'`, màu `#2B2928` (Light) / `#F5F5F5` (Dark), `lineHeight: 16px`, căn giữa, không bị cắt cụt hay gãy từ.
  * Hỗ trợ đầy đủ thuộc tính kích thước (`width`, `height`, `minWidth`...) trong `ScalePressable` để tránh hiện tượng thẻ bấm co cụm làm chữ bị tràn vỡ layout.

---

## 5. Quy chuẩn Thanh Điều Hướng & Hiệu Ứng Giao Diện (Navigation & Visual Standards)
* **TUYỆT ĐỐI KHÔNG làm hiệu ứng giả lập "Chuẩn 4 lớp Apple Liquid Glass" rườm rà:**
  * **NGHIÊM CẤM** tự làm 4 lớp hiệu ứng mô phỏng thủ công phức tạp gồm:
    * ❌ Lớp 1: Vành tán sắc lăng kính cầu vồng 5 dải màu ánh ngọc trai (`LinearGradient`).
    * ❌ Lớp 2: Thấu kính quang học mờ (`BlurView` độ mờ quang học 50 trên iOS) kèm lớp nền đệm siêu mỏng.
    * ❌ Lớp 3: Vệt sáng bóng mặt cong phản quang góc 45° (`topGloss`).
    * ❌ Lớp 4: Ánh viền phản chiếu đáy & Đổ bóng sắc ấm đất nung `#9C7156` (Light) hoặc đen sâu (Dark).
  * Lý do: Hiệu ứng giả lập nhiều lớp này làm giao diện bị rối mắt, thiếu tự nhiên, đi ngược tinh thần tối giản mộc mạc của gốm thủ công và gây lãng phí tài nguyên render.
* **Quy chuẩn Cơ chế Tách Nút Độc Lập & Hiệu Ứng Giọt Nước Chuẩn Hệ Thống iOS 26:**
  * Để tạo thanh Bottom Bar có bọt kính tròn (bubble indicator) bên trong và nút tròn tách biệt hoàn toàn bên phải (như nút Giỏ hàng), đồng thời khi nhấn giữ thì tự động phồng ra, kéo giãn giọt nước nối liền thanh Bar theo đúng cơ chế mặc định của Apple, luôn tuân theo 2 cách chuẩn hệ thống:
    * **Cách 1: Dùng `NativeTabs` nguyên bản 100% của iOS 26 (Ưu tiên số 1 — Ngắn gọn nhất):**
      * Khai báo thuộc tính `role="search"` cho tab cần tách (ví dụ tab Giỏ hàng): `<NativeTabs.Trigger name="cart" role="search">` từ `expo-router/unstable-native-tabs`.
      * Hệ thống iOS 26 sẽ tự động tách tab đó ra thành một viên bi kính tròn nằm riêng bên phải, tự động có bọt kính trượt giữa 4 icon bên trái và tự động có hiệu ứng kéo giãn giọt nước dính vào thanh chính khi nhấn giữ hoặc vuốt qua mà không cần bất kỳ thủ thuật vẽ canvas/gradient nào.
    * **Cách 2: Dùng `@callstack/liquid-glass` (Khi cần nhét ảnh 3D hoặc tuỳ chỉnh khoảng cách giọt nước):**
      * Bọc thanh Bar và nút tròn trong `<LiquidGlassContainerView spacing={18}>` với `gap: 12`.
      * Thanh viên thuốc bên trái: `<LiquidGlassView interactive={true} effect="regular">`.
      * Nút tròn độc lập bên phải: `<LiquidGlassView interactive={true} effect="regular" style={{ width: 68, height: 68, borderRadius: 34 }}>` bằng đúng chiều cao của thanh Bar bên trái.
      * Cơ chế vật lý: Khi không chạm thì hai khối đứng tách nhau 12pt; khi chạm vào nút tròn, hiệu ứng đàn hồi của iOS 26 (`interactive={true}`) làm nút phồng to vượt ngưỡng 18pt của `spacing`, hai mép kính sẽ tự động hút lấy nhau tạo thành cổ nối chất lỏng tự nhiên của hệ thống.

---

## 6. Màu sắc & Tinh thần Thương hiệu (Brand Identity — Trích xuất từ Brand Guidelines PDF)
Bảng màu quy chuẩn chính thức của Tiệm Nhà Gốm được quy định nghiêm ngặt từ tài liệu `TiemNhaGom_Brand Guideline.pdf` (Màu sắc Logo & Nhận diện):

### 6.1. Bảng màu Logo & Nhận diện Thương hiệu Chuẩn (Official Brand Palette):
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

### 6.2. Các quy tắc cấm khi áp dụng nhận diện thương hiệu (Trang 6 Brand Guidelines):
* **Tuyệt đối không dùng màu khác ngoài bảng màu Brand:** Giữ trọn vẹn tinh thần gốm thủ công mộc mạc, tránh dùng các màu quá tươi, màu neon hoặc các dải màu lệch khỏi bảng mã màu quy chuẩn.
* **Bảo toàn tính tương phản:** Không đặt logo hoặc chữ trên nền màu không đủ độ tương phản; không đặt logo trực tiếp lên ảnh chụp có nhiều chi tiết gây rối mắt.
* **Không làm biến dạng logo:** Không xoay méo, không đổ bóng đậm (drop shadow) lên logo, không cắt xén, không tạo viền outline thô kệch.

### 6.3. Màu bổ trợ & Điểm nhấn giao diện (UI Functional Accents):
* **Tuyệt đối KHÔNG sử dụng màu xanh (xanh lá, xanh rêu, xanh lam, olive):** Nghiêm cấm sử dụng các màu xanh trong toàn bộ giao diện app và web.
* **Màu chữ phụ (Text Secondary / Muted):** `#6E665D` / `#9E968D`.
* **Viền tiêu chuẩn giao diện:** `#E8E1D8` / `#E8CCB2`.
* **Trạng thái Thành công / Tích điểm / Đơn hoàn tất:** Sử dụng màu Nâu Đất Nung `#9C7156`, Men Be `#E8CCB2` hoặc Nâu Trầm `#2B2928` để biểu thị, thay thế hoàn toàn cho màu xanh.

---

## 7. Quy chuẩn Giao diện Dark Mode (Lấy chuẩn từ trang Stores — `app/stores.tsx`)
Giao diện Dark Mode phải được thiết kế rõ ràng, tương phản tốt, không bị thô ráp hay chói mắt, sử dụng tông màu Đen Sâu OLED thuần khiết:

### 7.1. Bảng màu & Bố cục Dark Mode:
* **Màu nền toàn trang:** `#000000` (Pure Black OLED — `Colors.background`).
* **Màu nền Card View:** `#121212` (`Colors.cardBackground`), nổi khối thanh thoát trên nền đen sâu.
* **Màu nền Surface phụ / Icon Circle / Chip không active:** `#1E1E1E` (`Colors.surface`).
* **Màu chữ chính:** `#F5F5F5` (`Colors.textPrimary`), chữ phụ `#B0B0B0` / `#9E968D`, điểm nhấn men gốm `#E8CCB2` hoặc `#9C7156`.
* **Đường kẻ phân cách (Divider):** `#222222` (`Colors.divider`).

### 7.2. Quy tắc Viền (Border) & Nút Back ở Dark Mode:
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

## 8. Quy chuẩn Màn hình Đăng Nhập & Xác Thực (Auth Screens UX)
* **Không đặt nút đóng 'X' ở đầu trang:** Tránh cảm giác vụng về hoặc xung đột điều hướng; màn hình auth tập trung tối đa vào trải nghiệm người dùng.
* **Không nhân đôi nút chuyển đổi Đăng nhập / Đăng ký:**
  * Tuyệt đối không vừa đặt badge chuyển đổi trên header vừa đặt nút chuyển đổi dưới chân form.
  * Chỉ giữ lại duy nhất 1 liên kết chuyển chế độ trang nhã ở cuối form (`switchModeRow`).
* **Bảo lưu thiết lập Onboarding khi Đăng xuất (Logout UX):**
  * Khi người dùng đăng xuất (`signOut`), **tuyệt đối không xóa cờ `has_seen_onboarding` khỏi `AsyncStorage`**.
  * Các tùy chọn cài đặt trên thiết bị (ngôn ngữ, cỡ chữ, chủ đề sáng/tối, quyền hệ thống đã cấp) phải luôn được bảo lưu; sau khi đăng xuất người dùng chỉ được chuyển hướng về màn hình đăng nhập (`auth/login`), tuyệt đối không bắt người dùng phải làm lại quy trình giới thiệu, chọn ngôn ngữ/cỡ chữ hay cấp quyền lại.

---

## 9. Quy chuẩn Đa ngôn ngữ (i18n & Localization Bắt buộc)
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

---

## 10. Quy chuẩn Hiển thị Số, Giá Tiền & Typography Dữ Liệu (Numbers & Data Typography)
* **Tuyệt đối không dùng font máy đánh chữ / monospace (`SpaceMono`) cho số liệu:**
  * Không dùng `fontFamily: 'SpaceMono'` cho giá tiền, mã đơn hàng, số lượng tồn kho, chỉ số KPI doanh thu, điểm tích lũy hay bàn phím nhập PIN. Monospace làm con số bị kéo giãn thô ráp, lệch hàng và khó quan sát nhanh trong môi trường bán hàng.
* **Quy chuẩn Font Hệ Thống Hiện Đại (System Sans-Serif):**
  * Sử dụng typography chuẩn của hệ điều hành (San Francisco / SF Pro trên iOS, Roboto trên Android):
    * Trên iOS: Không đặt `fontFamily` (hoặc để `undefined`), React Native sẽ tự động áp dụng San Francisco chuẩn mực của Apple với đường nét tròn trịa, hiện đại và thanh thoát.
    * Trên Android: Dùng `fontFamily: 'sans-serif'`.
* **Độ đậm & Khoảng cách ký tự chuẩn:**
  * **Giá tiền & Tổng thanh toán (`productPrice`, `totalValue`):** Cỡ chữ `14px - 19px`, `fontWeight: '700'`, màu gốm mộc `#9C7156`.
  * **Chỉ số KPI & Thống kê doanh thu:** Cỡ chữ `20px - 26px`, `fontWeight: '700'`, màu `#2B2928` (hoặc `#F5F5F5` ở Dark Mode).
  * **Mã đơn hàng & Mã coupon (`orderCode`, `codeTag`):** `fontWeight: '600' - '700'`, bổ sung `letterSpacing: 0.3 - 0.5` để phân tách rõ ràng các ký tự và chữ số.
  * **Bàn phím nhập PIN quầy POS (`keyNumber`):** Cỡ chữ `26px`, `fontWeight: '500'` mô phỏng chính xác bàn phím số Apple Passcode cao cấp.

---

## 11. Quy chuẩn Hệ Thống Quản Trị & Ứng Dụng Bán Lẻ (Admin & Retail Architecture)
* **Cơ chế xác thực tài khoản quản trị nội bộ:**
  * Web Dashboard và App Retail vận hành hệ thống tài khoản nội bộ độc lập (Email/Mật khẩu), không sử dụng Google Login cho quản trị.
  * Dữ liệu tài khoản quản trị viên và nhân viên được lưu tập trung tại Firestore collection `admins/{uid}` với các trường phân quyền: `role` (`super_admin`, `admin`, `cashier`, `warehouse`, `decor_staff`), `permissions: string[]`, `active: boolean`.
* **Tuyệt đối không lưu mật khẩu hay tài khoản quản trị tối cao vào mã nguồn:**
  * Không hardcode email/mật khẩu trong code git. Mọi tài khoản quản trị viên tối cao được khởi tạo an toàn qua Firebase Auth & Firestore Rules.
* **Thanh điều hướng App Retail (Native Liquid Glass TabBar):**
  * Áp dụng `NativeTabs` từ `expo-router/unstable-native-tabs` trên iOS để tận dụng thanh `UITabBarController` gốc của Apple với hiệu ứng Liquid Glass và bộ biểu tượng Apple SF Symbols (`chart.pie`, `doc.text`, `cart`, `cube.box`, `square.grid.2x2`), màu nhấn thương hiệu `tintColor="#9C7156"`.

---

## 12. Quy chuẩn Chống Tràn Khung & Đảm Bảo Bố Cục An Toàn (Anti-Overflow & Safe Layout Standard)
* **Nguyên tắc không tràn viền:** Tuyệt đối không để chữ, số liệu giá tiền hay biểu tượng tràn ra ngoài khung viền Card, lấn sang nút bấm hoặc bị cắt cụt mất chữ.
* **Bắt buộc giới hạn dòng và đuôi ba chấm (Ellipsis truncation):**
  * Mọi thẻ văn bản trong các hàng danh sách, tiêu đề sản phẩm, tên khách hàng, mã đơn hàng: bắt buộc khai báo `numberOfLines={1}` (hoặc `{2}`) kết hợp `ellipsizeMode="tail"`.
* **Quy chuẩn hàng ngang (`flexDirection: 'row'`):**
  * Cột chứa văn bản (tên hàng, mô tả) bắt buộc phải có `flex: 1` hoặc `flexShrink: 1` kèm `marginRight: 8px` để tự động nhường không gian cho cột hiển thị giá tiền/số lượng bên phải.
  * Phần tử giá tiền và số lượng bên phải phải có `flexShrink: 0` để luôn giữ trọn vẹn số tiền, không bao giờ bị dồn ép thành dấu chấm lửng.
* **Co giãn số tiền tự động (Dynamic Currency Scaling):**
  * Với các con số giá trị lớn (`productPrice`, `totalValue`, thẻ thống kê KPI): luôn bổ sung `adjustsFontSizeToFit={true}` và `minimumFontScale={0.75 - 0.8}` để đảm bảo hiển thị hoàn hảo trên cả các thiết bị màn hình nhỏ (như iPhone SE).
* **Tách thuộc tính bố cục ra khỏi ScalePressable:**
  * Khi bọc các nút bấm hoặc ô tìm kiếm trong `ScalePressable`, các thuộc tính layout (`flex: 1`, `margin`, `width`, `minWidth`) phải được đặt ở thẻ chứa bao bọc ngoài cùng để tránh làm co cụm hoặc méo mó các thành phần lân cận khi chạm.

---

## 13. Quy chuẩn Nghiệp Vụ Đơn Hàng Tại Quầy POS (POS In-Store Orders Standard)
* **Định danh đơn hàng tại quầy:**
  * Mọi đơn hàng có mã bắt đầu bằng `POS-`, `id` chứa `POS`, hoặc có cờ `source: 'pos'` / `orderSource: 'pos'` / `cashierId` là đơn bán trực tiếp tại cửa hàng.
* **Trạng thái mặc định và bắt buộc:**
  * Đơn POS **100% đã hoàn tất thanh toán và giao nhận tại quầy**:
    * `status` luôn là **`'completed'` (Đã hoàn tất)** (trừ trường hợp chủ động ghi nhận hủy).
    * `paymentStatus` luôn là **`'paid'` (Đã thanh toán)**.
    * `source` định danh là `'pos'`.
* **Quy tắc hiển thị giao diện Đơn hàng:**
  * **Huy hiệu nguồn:** Hiển thị tag rõ ràng `🏪 BÁN TẠI QUẦY (POS)` kèm icon cửa hàng.
  * **Huy hiệu trạng thái:** Hiển thị `ĐÃ HOÀN TẤT` (`#9C7156` trên nền `rgba(156, 113, 86, 0.15)`).
  * **Khóa nút hành động:** Tuyệt đối không hiển thị các nút thao tác như "Duyệt đơn" hay "Giao hàng" cho đơn POS; luôn hiển thị huy hiệu cố định `Hoàn tất` với biểu tượng checkmark men gốm.
  * **Bộ lọc tab trạng thái:** Đơn POS được đưa về đúng tab "Đã hoàn tất" và "Tất cả", **tuyệt đối không xuất hiện trong tab "Chờ duyệt"**.
  * **Cảnh báo thông minh Dashboard:** Không tính đơn POS vào số lượng "Đơn mới cần xác nhận".

---

## 14. Quy chuẩn Báo Cáo Doanh Thu, Lợi Nhuận & Sổ Thuế (Financial & Tax Ledger Standard)
* **Phân định rõ 6 chỉ số tài chính cốt lõi (Financial KPIs):**
  1. **Doanh thu gộp (Gross Revenue):** Tổng giá trị đơn hàng phát sinh chưa trừ hủy.
  2. **Doanh thu thuần (Net Revenue):** Doanh thu thực tế sau khi đã loại bỏ toàn bộ đơn hủy/trả.
  3. **Lợi nhuận gộp ước tính (Estimated Gross Profit):** Doanh thu thuần trừ đi giá vốn hàng bán (COGS).
  4. **Số đơn hoàn tất:** Tổng số giao dịch thành công trong chu kỳ.
  5. **Tỷ lệ hủy đơn (Cancellation Rate):** Tỷ lệ phần trăm giữa đơn hủy trên tổng lượt tạo đơn.
  6. **Giá trị trung bình/đơn (AOV):** Doanh thu thuần chia cho số đơn thành công.
* **Biểu đồ cột phân bổ chu kỳ trực quan (Cyclical Revenue Chart):**
  * Hỗ trợ xem linh hoạt theo: Hôm nay (phân bổ 4 khung giờ: Sáng 6-12h, Chiều 12-17h, Tối 17-21h, Đêm 21-6h), 7 ngày gần nhất, Tháng này, Quý này, và Năm nay.
* **Bảng kê nghĩa vụ thuế Hộ Kinh Doanh Cá Thể:**
  * Áp dụng theo quy định pháp luật ngành thương mại bán lẻ:
    * **Thuế GTGT (VAT):** 1.0% trên tổng doanh thu tính thuế.
    * **Thuế TNCN:** 0.5% trên tổng doanh thu tính thuế.
    * **Tổng nghĩa vụ thuế:** 1.5% doanh thu, hiển thị rõ ràng, minh bạch giúp chủ tiệm quản trị rủi ro tài chính.

---

## 15. Quy chuẩn Kiểm Kê Két Tiền & Kết Ca Thu Ngân (Cash Drawer & Shift Handover Standard)
* **Phân loại dòng tiền thanh toán:**
  * Tách biệt rõ ràng 3 nguồn tiền: Tiền mặt tại quầy (Cash in Drawer), Chuyển khoản VietQR, và Quẹt thẻ POS.
* **Quy trình kết ca & bàn giao:**
  * Thu ngân nhập số tiền mặt thực tế kiểm đếm được trong két.
  * Hệ thống tự động tính toán chênh lệch: `Chênh lệch = Tiền mặt thực tế - (Tiền đầu ca + Tiền mặt thu trong ca)`.
  * Hiển thị cảnh báo lệch két (Thừa / Thiếu tiền) màu gốm trầm, không dùng màu xanh.
  * Bắt buộc có phần ghi chú bàn giao ca và lưu dữ liệu đối soát vào collection `shift_reports` trên Firestore.
