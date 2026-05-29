# Tính năng Bộ Sưu Tập (Collections) - Thay thế Categories

## Mô tả
Thay thế phần "Categories" trên trang chủ thành "Bộ Sưu Tập" (Collections). Admin có thể tạo/quản lý các bộ sưu tập (tên + ảnh banner) và gán sản phẩm vào bộ sưu tập khi thêm/sửa sản phẩm. User click vào bộ sưu tập sẽ chỉ thấy sản phẩm thuộc bộ đó.

## Proposed Changes

### Firestore Data Structure

Lưu danh sách bộ sưu tập trong `settings/collections`:
```json
{
  "items": [
    { "name": "Gốm Tối Giản", "imageUrl": "https://...", "order": 1 },
    { "name": "Gốm Vintage", "imageUrl": "https://...", "order": 2 },
    { "name": "Quà Tặng", "imageUrl": "https://...", "order": 3 }
  ]
}
```

Mỗi sản phẩm sẽ có thêm trường `collections` (mảng string):
```json
{
  "name": "Bình hoa men lam",
  "collections": ["Gốm Tối Giản", "Quà Tặng"]
}
```

> [!IMPORTANT]
> Dùng **mảng** `collections` (thay vì 1 string) để 1 sản phẩm có thể thuộc nhiều bộ sưu tập. Firestore hỗ trợ query `array-contains` rất hiệu quả cho trường hợp này.

---

### Admin — Quản lý Bộ sưu tập

#### [MODIFY] [index.html](file:///d:/tiemnhagom-project/admin/index.html)
- Thêm tab **"🎨 Bộ sưu tập"** vào sidebar
- Thêm section `collections-section` với:
  - Form thêm/sửa bộ sưu tập (tên + upload ảnh banner)
  - Danh sách bộ sưu tập hiện có (sửa/xóa/kéo thả đổi thứ tự)

#### [MODIFY] [admin.js](file:///d:/tiemnhagom-project/js/admin.js)
- Thêm logic CRUD cho `settings/collections`:
  - `initCollectionManager()` — lắng nghe realtime
  - `renderCollectionList()` — hiển thị danh sách
  - Upload ảnh banner qua Firebase Storage
  - Xóa/sửa tên bộ sưu tập

---

### Admin — Gán sản phẩm vào bộ sưu tập

#### [MODIFY] [index.html](file:///d:/tiemnhagom-project/admin/index.html)
- Thêm trường **checkbox multi-select** `collections` vào form sản phẩm (dưới trường "Phân loại")
- Hiển thị dạng tag/chip, cho phép chọn nhiều bộ

#### [MODIFY] [admin.js](file:///d:/tiemnhagom-project/js/admin.js)
- Populate checkbox list từ `settings/collections` 
- Khi lưu sản phẩm: ghi thêm trường `collections: [...]`
- Khi sửa sản phẩm: tự động check lại các bộ sưu tập đã chọn

---

### Trang chủ — Hiển thị bộ sưu tập

#### [MODIFY] [index.html](file:///d:/tiemnhagom-project/index.html)
- Thay section `categories-section` (dòng 151-168) thành section `collections-section`
- Hiển thị dạng banner 3 cột với ảnh + tên bộ sưu tập
- Link dẫn đến `products/?collection=TenBo`

#### [MODIFY] [main.js](file:///d:/tiemnhagom-project/js/main.js)
- Thêm hàm `fetchCollections()` — đọc từ Firestore `settings/collections`
- Render HTML banner cho mỗi bộ sưu tập

#### [MODIFY] [style.css](file:///d:/tiemnhagom-project/css/style.css)
- Cập nhật CSS cho `.collections-section` (grid 3 cột responsive)

---

### Trang Products — Lọc theo bộ sưu tập

#### [MODIFY] [products.js](file:///d:/tiemnhagom-project/js/products.js)
- Đọc tham số URL `?collection=TenBo`
- Khi có `collection` param: query `where("collections", "array-contains", collectionName)` từ Firestore
- Cập nhật tiêu đề trang và breadcrumb

---

## Open Questions

> [!IMPORTANT]
> **Mỗi sản phẩm có thể thuộc nhiều bộ sưu tập cùng lúc không?** (VD: 1 bình hoa vừa thuộc "Gốm Tối Giản" vừa thuộc "Quà Tặng"). Mình đang thiết kế cho phép chọn nhiều — bạn có đồng ý không?

## Verification Plan

### Manual Verification
1. Vào Admin → Tạo 3 bộ sưu tập (tên + ảnh)
2. Vào Admin → Sửa sản phẩm → Chọn bộ sưu tập → Lưu
3. Vào Trang chủ → Kiểm tra hiển thị 3 banner bộ sưu tập
4. Click vào 1 bộ → Kiểm tra trang Products chỉ hiện sản phẩm đã gán
