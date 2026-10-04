<p align="center">
  <img src="https://img.icons8.com/fluency/96/telegram-app.png" alt="Telegram Shop Bot" width="96"/>
</p>

<h1 align="center">🤖 Telegram Shop Bot</h1>

<p align="center">
  <strong>Bot bán hàng tự động trên Telegram với thanh toán QR VietQR</strong><br/>
  <em>Auto-selling Telegram bot with VietQR payment, stock management & Google Sheet sync</em>
</p>

<p align="center">
  <b>🇻🇳 Tiếng Việt</b> | <a href="README_EN.md">🇬🇧 English</a>
</p>

<p align="center">
  <a href="#-cài-đặt-nhanh"><img src="https://img.shields.io/badge/Cài_đặt-3_phút-brightgreen?style=for-the-badge" alt="Setup"/></a>
  <a href="https://github.com/kentzu213/telegram-shop-bot/stargazers"><img src="https://img.shields.io/github/stars/kentzu213/telegram-shop-bot?style=for-the-badge&color=yellow" alt="Stars"/></a>
  <a href="https://github.com/kentzu213/telegram-shop-bot/blob/main/LICENSE"><img src="https://img.shields.io/github/license/kentzu213/telegram-shop-bot?style=for-the-badge&color=blue" alt="License"/></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Telegraf-4.x-229ED9?style=flat-square&logo=telegram&logoColor=white" alt="Telegraf"/>
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite"/>
  <img src="https://img.shields.io/badge/VietQR-Payment-FF6B35?style=flat-square" alt="VietQR"/>
  <img src="https://img.shields.io/badge/Google_Sheets-Sync-34A853?style=flat-square&logo=googlesheets&logoColor=white" alt="Google Sheets"/>
</p>

---

## ✨ Tính năng nổi bật

| Tính năng | Mô tả |
|-----------|--------|
| 🤖 **Giao hàng tự động 100%** | Webhook [SePay](https://sepay.vn): tiền vào → bot tự giao tài khoản trong vài giây |
| 💳 **QR VietQR** | Tạo mã QR tức thì, hỗ trợ 40+ ngân hàng VN, cho khách chọn 1 trong 2 ngân hàng |
| 👛 **Ví số dư** | Nạp tiền tự động, mua hàng tức thì bằng số dư; tiền chuyển dư/trễ tự cộng vào ví |
| 🧾 **Lịch sử đơn** | `/donhang` — khách xem lại tài khoản đã mua bất cứ lúc nào |
| 🛠 **Bảo hành** | Khách báo lỗi theo đơn, admin đổi tài khoản từ kho bằng 1 nút |
| 🎁 **Khuyến mãi** | Mã giảm giá (%, số tiền, giới hạn lượt, hạn dùng) và "Mua X tặng Y" |
| 📦 **Quản lý kho** | Nhập bằng tin nhắn hoặc file `.txt`, tự loại trùng, giữ hàng cho đơn đang chờ, cảnh báo sắp hết |
| ⏰ **Hết hạn đơn** | Đơn chưa thanh toán tự hủy sau 15 phút, xóa QR cũ |
| 🔧 **Admin chuyên nghiệp** | Nhiều admin, thống kê 7/30 ngày, top sản phẩm, xuất CSV, tra cứu tài khoản đã bán cho ai |
| 📊 **Google Sheet Sync** | Đồng bộ sản phẩm & danh mục mỗi 5 phút, tự tắt sản phẩm bị xóa khỏi sheet |
| 📢 **Broadcast** | Gửi văn bản/ảnh/video tới mọi khách, giới hạn tốc độ đúng chuẩn Telegram |
| 💾 **Vận hành an toàn** | Backup DB hằng ngày gửi về admin, báo cáo cuối ngày, cảnh báo lỗi, Docker & PM2 |

## 🔄 Flow mua hàng

```
Khách: /product → Danh mục → Sản phẩm → Số lượng → (Mã giảm giá) → Thanh toán
                                   ↓
          ┌────────────────────────┴────────────────────────┐
     👛 Số dư: giao ngay                    🏦 QR VietQR: khách chuyển khoản
                                                         ↓
                                  SePay webhook (hoặc admin bấm ✅ Xác nhận)
                                                         ↓
                    Còn kho → bot gửi tài khoản ✅  ·  Hết kho → admin nhập tay 📝
```

## ⚡ Cài đặt nhanh

### Yêu cầu
- [Node.js](https://nodejs.org/) v18.17 trở lên (hoặc Docker)
- Telegram Bot Token (từ [@BotFather](https://t.me/BotFather))
- Tài khoản ngân hàng (hỗ trợ [VietQR](https://vietqr.io/))

### 1️⃣ Clone & cài đặt

```bash
git clone https://github.com/kentzu213/telegram-shop-bot.git
cd telegram-shop-bot
npm install
```

### 2️⃣ Cấu hình

```bash
cp .env.example .env
```

Mở `.env` và điền tối thiểu:

```env
BOT_TOKEN=1234567890:ABCdefGhIjKlMnOpQrS     # từ @BotFather
ADMIN_IDS=123456789                          # nhiều admin: 111,222
BANK_BIN=970422                              # tra BIN: vietqr.io/danh-sach-ngan-hang
BANK_ACCOUNT=1234567890
BANK_ACCOUNT_NAME=NGUYEN VAN A
BANK_NAME=MB
SHOP_NAME=My Shop
SUPPORT_CONTACT=@your_username
```

> 💡 Chưa biết Telegram ID? Chạy bot rồi gửi `/myid`, điền vào `ADMIN_IDS` và restart.
> Xem đầy đủ các tùy chọn trong [.env.example](.env.example).

### 3️⃣ Chạy bot

```bash
npm start            # chạy thường
npm run dev          # tự restart khi sửa code
```

**Production (chọn 1):**

```bash
docker compose up -d --build                  # Docker (DB lưu ở ./data)
pm2 start ecosystem.config.js && pm2 save     # PM2
```

### 🖥 Admin web

Giao diện quản trị chạy cùng HTTP server của bot tại `/admin`. Để bật đăng nhập web, thêm vào `.env`:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=đặt_mật_khẩu_dài_và_riêng
WEB_SESSION_SECRET=chuỗi_bí_mật_ngẫu_nhiên_dài
WEB_SESSION_TTL=28800
```

Sau khi khởi động lại, mở `http://localhost:3000/admin`. Bản MVP đã nối tổng quan, sản phẩm/danh mục, kho nhập và đơn hàng; các màn mở rộng vẫn hiển thị nhưng khóa thao tác cho đến khi có API tương ứng.

## 🤖 Thanh toán tự động (SePay)

1. Đăng ký [sepay.vn](https://sepay.vn) và liên kết tài khoản ngân hàng nhận tiền.
2. Mở port `WEBHOOK_PORT` ra Internet qua HTTPS (Nginx, Caddy hoặc Cloudflare Tunnel).
3. Trên SePay, tạo **Webhook**:
   - URL: `https://<domain>/webhook/sepay`
   - Kiểu chứng thực: **API Key**, rồi điền cùng giá trị vào `SEPAY_API_KEY` trong `.env`.
4. Restart bot. Mỗi giao dịch được xử lý **đúng 1 lần** (chống trùng theo mã giao dịch):
   - Đủ tiền → giao hàng ngay; chuyển dư → phần dư vào số dư.
   - Chuyển thiếu → bot báo số còn thiếu; chuyển thêm cùng nội dung là hoàn tất.
   - Đơn đã hết hạn/hủy → toàn bộ tiền vào số dư (không mất tiền của khách).
   - Nội dung không khớp đơn nào → báo admin.

> Không dùng SePay: bot vẫn chạy, admin bấm **✅ Xác nhận** trên thông báo đơn mới (hoặc `/confirm ID`).

## 📋 Danh sách lệnh

<details>
<summary><b>👤 Lệnh người dùng</b></summary>

| Lệnh | Mô tả |
|-------|--------|
| `/start` | 🔄 Bắt đầu + menu nhanh |
| `/product` | 📦 Danh sách sản phẩm |
| `/donhang` | 🧾 Đơn hàng của tôi, xem lại tài khoản, bảo hành |
| `/nap [số tiền]` | 💰 Nạp số dư (vd: `/nap 50k`) |
| `/menu` | 👤 Thông tin tài khoản & số dư |
| `/support` | 🆘 Hỗ trợ |
| `/myid` | 🆔 Lấy Telegram ID |
| `/cancel` | ❌ Hủy thao tác đang nhập |

</details>

<details>
<summary><b>🔧 Lệnh Admin</b></summary>

| Lệnh | Mô tả |
|-------|--------|
| `/admin` | 📊 Admin panel tổng quan |
| **Sản phẩm** | |
| `/listproduct` | Xem tất cả sản phẩm (kho thật, kho sheet, đang giữ) |
| `/addproduct catID \| tên \| giá` | Thêm sản phẩm mới |
| `/addcategory tên \| emoji` | Thêm danh mục |
| `/editprice ID giá` · `/editname ID tên` | Sửa giá / tên |
| `/setcategory ID catID` | Đổi danh mục |
| `/setpromo ID X Y` | Mua X tặng Y (`0 0` để tắt) |
| `/setnote ID nội dung` | Hướng dẫn gửi kèm khi giao (`-` = không, `default` = mặc định) |
| `/toggleproduct ID` | Bật/tắt sản phẩm |
| `/deleteproduct ID` · `/restoreproduct ID` | Xóa mềm / khôi phục (giữ lịch sử đơn) |
| **Kho hàng** | |
| `/addstock ID` | Thêm tài khoản: gửi tin nhắn hoặc file `.txt`, tự bỏ trùng |
| `/viewstock ID` | Xem kho sản phẩm |
| `/clearstock ID` | Xóa kho chưa bán (có xác nhận) |
| `/tracuu từ_khóa` | Tra tài khoản đã bán cho ai, tra đơn theo ID / mã CK |
| **Đơn hàng & tiền** | |
| `/pending` | Đơn chờ thanh toán |
| `/awaiting` | Đơn đã thanh toán, chờ giao thủ công |
| `/confirm ID` | ✅ Xác nhận & giao hàng |
| `/cancelorder ID` | Hủy đơn (tự hoàn số dư nếu khách đã trả) |
| `/orders` | Đơn hàng gần đây |
| `/warranty` | Yêu cầu bảo hành đang mở |
| `/addbalance userID số_tiền [ghi chú]` | Cộng/trừ số dư khách |
| **Khuyến mãi** | |
| `/addcoupon MÃ \| 10% \| lượt \| đơn tối thiểu \| số ngày` | Tạo mã giảm giá |
| `/coupons` · `/delcoupon MÃ` | Xem / tắt mã |
| **Cài đặt** | |
| `/setbank` | Xem/sửa ngân hàng 1, 2 khi đang chạy |
| `/setshop tên \| @telegram \| zalo \| slogan` | Thông tin shop & liên hệ |
| `/setwelcome` | Soạn lời chào (ảnh banner, emoji động) |
| `/seticon cat\|sp ID` | Icon cho nút danh mục / sản phẩm |
| `/sync` | Đồng bộ Google Sheet ngay |
| **Báo cáo** | |
| `/stats` | Doanh thu hôm nay / 7 / 30 ngày, top sản phẩm |
| `/export [số ngày]` | Xuất CSV đơn hàng (mở được bằng Excel) |
| `/users` | Danh sách users |
| `/backup` | Backup database ngay |
| `/broadcast [nội dung]` | Gửi thông báo (văn bản, ảnh, video...) có xem trước |

</details>

## 📦 Thêm hàng vào kho

```bash
# Bước 1: Gửi lệnh với product ID
/addstock 1

# Bước 2: Gửi danh sách tài khoản (mỗi dòng 1 cái) — hoặc gửi file .txt
email1@example.com|password1|extra_info1
email2@example.com|password2|extra_info2
```

Hàng trong kho được **giữ cho các đơn đang chờ thanh toán**, nên không bán vượt số lượng. Khi kho còn ít hơn `LOW_STOCK_THRESHOLD`, bot báo cho admin.

## 📊 Google Sheet Sync (tùy chọn)

Đồng bộ danh sách sản phẩm tự động từ Google Sheet:

| Cột | Nội dung |
|-----|----------|
| A | ID |
| B | Tên sản phẩm |
| C | Giá bán |
| D | Đơn vị |
| E | Số lượng trong kho |
| F | Còn hàng (TRUE/FALSE) |
| G | Link liên hệ (Zalo...) |
| H | Ghi chú / Khuyến mãi |
| I | Danh mục (tùy chọn, tự tạo nếu chưa có) |

**Cách setup:**
1. **Chia sẻ → "Bất kỳ ai có đường liên kết đều xem được"**
2. Copy Sheet ID từ URL: `docs.google.com/spreadsheets/d/[SHEET_ID]/edit`
3. Thêm vào `.env`:
```env
GOOGLE_SHEET_ID=your_sheet_id
SHEET_SYNC_INTERVAL=5
```

Sản phẩm bị xóa khỏi sheet sẽ tự tắt. Sheet rỗng hoặc lỗi thì bot bỏ qua lần đồng bộ đó, không tắt hàng loạt.

## 🎨 Giao diện & thương hiệu

- **Nút màu theo tình trạng hàng:** 🟢 còn hàng · 🔵 liên hệ · 🔴 hết hàng. Khách nhìn màu là biết mua được ngay hay không.
- **Vào bot là thấy hàng:** `/start` hiện lời chào kèm lưới danh mục. Số cột (2 hoặc 3) tự chọn theo độ dài tên nên không bị cắt chữ.
- **`/setwelcome`:** soạn lời chào ngay trên Telegram (ảnh banner, emoji động, in đậm, link). `{name}` được thay bằng tên khách, `{shop}` bằng tên shop.
- **`/seticon cat ID`:** gửi 1 emoji động (logo ChatGPT, Canva...) để làm icon trên nút danh mục. Bot gửi thử trước khi lưu.
- **`/setshop tên | @telegram | zalo | slogan`:** thông tin liên hệ hiển thị ở lời chào và có nút mở Zalo/Telegram.

**Bộ danh mục AI có sẵn và logo:**

```bash
node scripts/seed-ai-catalog.js      # nhập 20 danh mục phần mềm AI (chạy lại nhiều lần vẫn an toàn)
node scripts/create-logo-emoji.js    # tạo bộ emoji logo từ assets/logos/ và gắn lên nút
```

> Emoji động trong tin nhắn và trên nút chỉ hoạt động khi **tài khoản tạo bot có Telegram Premium** (quy định của Telegram). Nút màu thì hoạt động với mọi bot.

## 🏦 Hỗ trợ 2 ngân hàng

Thêm ngân hàng thứ 2 vào `.env`, hoặc dùng lệnh `/setbank 2 BIN | STK | TÊN | NH` khi bot đang chạy:

```env
BANK2_BIN=970436
BANK2_ACCOUNT=9876543210
BANK2_ACCOUNT_NAME=NGUYEN VAN A
BANK2_NAME=VCB
```

## 🧪 Kiểm thử

```bash
npm run check        # ESLint + toàn bộ test (node:test)
```

## 🛠 Tech Stack

| Công nghệ | Mô tả |
|-----------|--------|
| [Node.js](https://nodejs.org/) | Runtime JavaScript |
| [Telegraf v4](https://github.com/telegraf/telegraf) | Telegram Bot Framework |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | SQLite database (WAL, transaction) |
| [Express](https://expressjs.com/) | Webhook SePay / Telegram |
| [VietQR API](https://vietqr.io/) | Tạo mã QR thanh toán |
| [nanoid](https://github.com/ai/nanoid) | Tạo mã thanh toán unique |

## 📁 Cấu trúc dự án

```
telegram-shop-bot/
├── .env.example            # Mẫu cấu hình (copy → .env)
├── Dockerfile · docker-compose.yml · ecosystem.config.js
├── data/                   # SQLite database + backups (tự tạo)
├── test/                   # Test (node:test)
└── src/
    ├── bot.js              # 🚀 Entry point: polling/webhook, khởi động jobs
    ├── app.js              # Đăng ký middleware & handlers
    ├── config.js           # ⚙️ Cấu hình + kiểm tra
    ├── database.js         # 💾 Schema, migration, index
    ├── server.js           # 🌐 /health, SePay & Telegram webhook
    ├── jobs.js             # ⏰ Hết hạn đơn, báo cáo ngày, backup
    ├── middlewares.js      # Chống spam, theo dõi user
    ├── commands/           # 📋 Lệnh khách: start, product, orders, nap
    ├── handlers/           # ⚡ productSelect, checkout, warranty, stateRouter
    │   └── admin/          # 🔧 panel, products, stock, orders, coupons, settings, reports, broadcast
    ├── services/           # 🔧 Business logic (order, payment, delivery, topup, coupon, ...)
    └── utils/              # 🎨 messages, keyboard, format, csv, reply
```

## 📞 Liên hệ & Hỗ trợ

Nếu cần hỗ trợ cài đặt, tùy chỉnh, hoặc có câu hỏi:

| Kênh | Liên hệ |
|------|---------|
| 💬 **Telegram** | [@kentng](https://t.me/kentng) |
| 📱 **Nhóm Zalo** | [Tham gia nhóm chat](https://zalo.me/g/agaxxc699) |
| 🐛 **Bug Report** | [Mở Issue](https://github.com/kentzu213/telegram-shop-bot/issues) |

## 🤝 Đóng góp

Pull requests luôn được chào đón! Với thay đổi lớn, vui lòng mở issue trước.

## 📄 License

[MIT](LICENSE) © 2026 [kentzu213](https://github.com/kentzu213)

---

<p align="center">
  Nếu project hữu ích, hãy ⭐ <b>star</b> repo nhé!<br/>
  💬 Liên hệ: <a href="https://t.me/kentng">@kentng</a> | 📱 <a href="https://zalo.me/g/agaxxc699">Nhóm Zalo</a>
</p>
