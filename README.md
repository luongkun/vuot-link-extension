# Vượt Link — Chrome Extension (Manifest V3)

Extension Chrome / Edge tự động vượt qua các trang rút gọn link và quảng cáo
phổ biến (Linkvertise, ouo.io, link1s, yeumoney, megaurl, bit.ly, t.co, …).

## Cách hoạt động

Extension kết hợp 3 chiến lược, ưu tiên theo thứ tự:

1. **HEAD redirect** — với shortener đơn giản (bit.ly, t.co, tinyurl, …)
   extension trực tiếp gửi `fetch` với `redirect: 'manual'` và đọc header
   `Location` để lấy URL gốc. Không cần API ngoài.
2. **Crowd-Bypass** (mặc định, **miễn phí**, không cần API key) —
   với link quảng cáo (Linkvertise, work.ink, ouo.io, link1s, yeumoney…),
   extension query server cộng đồng
   [crowd.fastforward.team](https://fastforwardteam.github.io/serverdocs/).
   Khi vượt thành công, extension cũng tự đóng góp ngược lại cho cộng đồng.
3. **bypass.vip Premium** (tuỳ chọn) — nếu bạn có API key bypass.vip Premium,
   dán vào trang **Cài đặt nâng cao** thì extension sẽ dùng làm fallback khi
   Crowd-Bypass không có dữ liệu.

> 📢 API miễn phí của bypass.vip [đã ngừng hoạt động](https://api.bypass.vip/)
> tháng 3/2025. Extension đã sẵn sàng dùng bypass.vip Premium nếu bạn mua key,
> còn mặc định chạy hoàn toàn bằng Crowd-Bypass + HEAD-follow (miễn phí).

## Tính năng

- ⚡ **Tự động chuyển hướng** khi mở một link thuộc danh sách hỗ trợ.
- 🪄 **Vượt thủ công** trong popup (dán link bất kỳ → bấm "Vượt").
- 🖱️ **Menu chuột phải** trên link hoặc trang: "Vượt link này".
- 📜 **Lịch sử** các lần vượt (lưu local, có thể xoá).
- ✅ **Đóng góp ngược** cho Crowd-Bypass khi content script tìm được link gốc.
- 🔧 **Cài đặt nâng cao**: bật/tắt từng domain, thêm API key bypass.vip,
   bật thông báo desktop, xoá cache/lịch sử.
- 🚫 **Không thu thập dữ liệu**: mọi cài đặt nằm trong `chrome.storage.local`
   của trình duyệt bạn.

## Cài đặt (chế độ Developer / unpacked)

1. Tải hoặc clone repo này về máy.
2. Mở Chrome / Edge / Brave và vào `chrome://extensions`.
3. Bật **"Developer mode"** ở góc trên bên phải.
4. Bấm **"Load unpacked"** và chọn thư mục `link-bypass-extension/`.
5. Pin icon **Vượt Link** lên thanh công cụ cho tiện.

> Trên Edge, đường dẫn là `edge://extensions`. Trên Brave là `brave://extensions`.

## Sử dụng

### Tự động

Mở bất kỳ link rút gọn nào trong danh sách hỗ trợ. Extension sẽ:

- Hiện huy hiệu "…" màu cam trên icon trong khi đang vượt.
- Chuyển hướng tab sang URL gốc nếu vượt thành công (huy hiệu "✓" xanh).
- Nếu Crowd-Bypass chưa có dữ liệu, bạn cứ truy cập bình thường — content
   script sẽ cố tìm link gốc trên trang và **đóng góp về cộng đồng**.

### Thủ công

1. Bấm vào icon Vượt Link.
2. Dán link vào ô **"Dán link cần vượt"**.
3. Bấm **"Vượt"** hoặc nhấn Enter. Kết quả hiện ngay trong popup, kèm nút
   **Mở** và **Copy**.

### Menu chuột phải

- Phải chuột vào một link → **"Vượt link này (Vượt Link)"** → mở tab mới
   với URL gốc.
- Phải chuột trên trang → **"Vượt link của trang hiện tại"**.

### Khi không vượt được

Nếu popup báo lỗi (ví dụ "Cộng đồng Crowd-Bypass chưa có dữ liệu cho link
này"), bấm **"Mở trang gốc"** trong popup. Extension sẽ tự:

- Auto-click các nút "Get Link / Tiếp tục / Bỏ qua / Lấy link / Vào link"
   theo nhiều mốc thời gian (1.5s → 70s) để ride out các countdown dài.
- Chạy **site-specific solver** cho yeumoney, link1s, link4m, megaurl, ouo,
   exe.io / exee.io / owolinks / droplink / cuty.io — biết chính xác chỗ
   site nhả URL đích.
- Quét trang để tìm URL đích trong các thẻ `<a>`, `<input hidden>`,
   `data-url`, `data-link`, hoặc text URL trên trang.
- **Tự chuyển hướng tab** sang URL đích khi tìm thấy (có thể tắt trong
   Cài đặt → "Tự động chuyển hướng khi extension lấy được link đích từ
   trang").
- **Đóng góp lại** URL đích cho Crowd-Bypass khi tìm thấy → lần sau bạn
   (và mọi user khác) sẽ vượt được luôn ở bước Crowd-Bypass.

Trong khi extension đang xử lý, popup sẽ hiện trạng thái "Đang chờ trang
hiện link đích…" để bạn biết giữ tab mở.

> Linkvertise và Work.ink dùng captcha nên auto-click bị tắt — cần giải
> captcha thủ công, sau đó extension vẫn tự đóng góp link đích.

## Danh sách hỗ trợ

Xem trong trang **Cài đặt nâng cao** (mở từ popup → "Cài đặt nâng cao") hoặc
file [`lib/domains.js`](lib/domains.js). Một số nhóm chính:

- **Shortener**: bit.ly, t.co, tinyurl.com, is.gd, v.gd, goo.gl, rebrand.ly,
   ow.ly, lnkd.in, youtu.be, amzn.to, fb.me, wp.me, cutt.ly, shorturl.at, …
- **Ad-link quốc tế**: Linkvertise (mọi domain), work.ink, ouo.io, ouo.press,
   shorte.st, sh.st, adf.ly, adfoc.us, exe.io, owolinks.com, droplink.co,
   boost.ink, cuty.io, social-unlock, sub2unlock, rekonise, paster.so,
   loot-link.com, lootdest.\*, lootlabs.gg, …
- **Ad-link Việt Nam**: link1s.com, link1s.net, link4m.com, yeumoney.com,
   kiemtienol.com, kiemtienmod.net, kiemtien.gg, kiemtienbank.com, megaurl.in.

Muốn thêm domain mới? Sửa `lib/domains.js`, thêm một entry rồi cập nhật
phần `content_scripts.matches` trong `manifest.json` nếu là ad-link.

## Cấu trúc thư mục

```
link-bypass-extension/
├── manifest.json
├── background.js          # service worker
├── content/redirect.js    # content script chạy trên trang ad-link
├── lib/
│   ├── domains.js         # danh sách domain + chiến lược
│   └── bypass.js          # HEAD-follow, Crowd-Bypass, bypass.vip
├── popup/                 # giao diện popup
├── options/               # trang cài đặt nâng cao
├── icons/                 # icon 16/32/48/128
├── scripts/make_icons.py  # script regenerate icon
└── README.md
```

## Build / phát hành

Extension là JS thuần, **không cần build step**. Để đóng gói file `.zip` cho
Chrome Web Store:

```bash
cd link-bypass-extension
zip -r vuot-link.zip . -x "scripts/*" "*.md" ".git*"
```

## Ghi nhận

- [FastForwardTeam/Server](https://github.com/FastForwardTeam/Server) — cảm ơn
   nhóm FastForward đã duy trì Crowd-Bypass server miễn phí cho cộng đồng.
- [bypass.vip](https://bypass.vip) — bộ sưu tập bypass chất lượng nhất hiện
   tại (Premium).

## Giấy phép

MIT. Xem [LICENSE](LICENSE).
