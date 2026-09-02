# HAPPY BIRTHDAY STORY V3 — BẢN HOÀN CHỈNH

## 1) BỎ ẢNH VÀ VIDEO Ở ĐÂU?

Chỉ bỏ FILE GỐC vào:

`happy-birthday-backend/media-original/`

Bạn có thể bỏ TẤT CẢ chung một folder. Không cần tự chia ảnh/video và không cần tự đổi đuôi.

Ví dụ:

- IMG_001.HEIC
- IMG_002.JPG
- anh-cu.PNG
- LivePhoto.MOV
- video-sinh-nhat.MP4
- clip.MKV

Backend sẽ tự nhận dạng và tạo bản dùng cho website trong `media-optimized/`.

- Ảnh -> WebP, tối đa 1600px, tự xoay đúng chiều.
- Video -> MP4 H.264 + AAC, tối đa 1280px, tối ưu stream trên web.
- File gốc KHÔNG bị sửa hoặc xóa.
- Khi bạn thêm/xóa/thay file trong `media-original`, server tự quét lại.
- File đã convert sẽ được cache, không convert lại nếu file gốc không thay đổi.

## 2) CÀI LẦN ĐẦU

Yêu cầu: Node.js 18 trở lên.

Mở Terminal tại thư mục `happy-birthday-backend` và chạy:

```bash
npm install
```

## 3) CHẠY WEBSITE

Vẫn trong `happy-birthday-backend`, chạy:

```bash
npm start
```

Sau đó mở:

`http://localhost:3000`

Bạn KHÔNG cần chạy frontend riêng. Backend đã serve luôn `frontend/index.html`, `style.css`, `app.js`.

## 4) NẾU MUỐN CHẠY FRONTEND RIÊNG (không khuyến nghị)

Backend:

```bash
cd happy-birthday-backend
npm start
```

Frontend: dùng Live Server mở folder `frontend`.
Frontend sẽ tự gọi backend ở `http://localhost:3000` khi nó phát hiện đang chạy ở port khác.

## 5) THỨ TỰ MEDIA

Code tự tạo timeline:

5 ảnh -> 1 video -> 5 ảnh -> 1 video -> ...

Nếu số video ít hơn số nhóm ảnh, video sẽ quay vòng. Video dư sẽ không bị dồn hàng loạt xuống cuối.

## 6) FLOW WEBSITE

Hộp quà -> 03.09.2001 -> 03.09.2026 -> 25 tuổi -> 25 YEARS OF MEMORIES -> cuốn sách 3D -> ảnh/video -> kết thúc + pháo hoa nhẹ.

## 7) LƯU Ý QUAN TRỌNG

- Luôn COPY ảnh/video vào `media-original`; đừng Replace cả folder nếu bên trong đã có dữ liệu.
- Giữ một bản backup riêng của `media-original`.
- `media-optimized` là file sinh tự động; có thể xóa và server sẽ tạo lại.
- Nếu HEIC đặc biệt không đọc được, trên macOS code sẽ thử thêm FFmpeg và `sips` làm fallback.

## 8) KIỂM TRA TRẠNG THÁI CONVERT

Mở:

`http://localhost:3000/api/media-status`

API nội dung cuốn sách:

`http://localhost:3000/api/story`
