<p align="center">
  <img src="https://img.icons8.com/fluency/96/telegram-app.png" alt="Telegram Shop Bot" width="96"/>
</p>

<h1 align="center">🤖 Telegram Shop Bot</h1>

<p align="center">
  <strong>Automated Telegram selling bot with VietQR payment integration</strong><br/>
  <em>Stock management, auto-delivery, Google Sheet sync & multi-bank support</em>
</p>

<p align="center">
  <a href="README.md">🇻🇳 Tiếng Việt</a> | <b>🇬🇧 English</b>
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Setup-3_minutes-brightgreen?style=for-the-badge" alt="Setup"/></a>
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

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🤖 **Fully automatic delivery** | [SePay](https://sepay.vn) webhook: money arrives → accounts delivered within seconds |
| 💳 **VietQR payments** | Instant QR codes for 40+ Vietnamese banks, customer can choose between 2 banks |
| 👛 **Wallet balance** | Auto top-up, instant purchases from balance; over/late payments are credited to the wallet |
| 🧾 **Order history** | `/donhang` — customers can re-open purchased accounts at any time |
| 🛠 **Warranty** | Customers report issues per order, admins replace accounts from stock in one tap |
| 🎁 **Promotions** | Coupons (%, fixed amount, usage limit, expiry) and "Buy X get Y free" |
| 📦 **Stock management** | Import via message or `.txt` file, de-duplication, stock reserved for pending orders, low-stock alerts |
| ⏰ **Order expiry** | Unpaid orders auto-cancel after 15 minutes and old QR codes are removed |
| 🔧 **Pro admin tools** | Multiple admins, 7/30-day stats, top products, CSV export, look up who bought an account |
| 📊 **Google Sheet Sync** | Syncs products & categories every 5 minutes, deactivates products removed from the sheet |
| 📢 **Broadcast** | Send text/photos/videos to all customers with Telegram-safe rate limiting |
| 💾 **Safe operations** | Daily DB backup sent to admin, daily report, error alerts, Docker & PM2 |

## 🔄 Purchase Flow

```
Customer: /product → Category → Product → Quantity → (Coupon) → Payment
                                   ↓
          ┌────────────────────────┴────────────────────────┐
     👛 Balance: instant delivery            🏦 VietQR: customer transfers money
                                                         ↓
                                  SePay webhook (or admin taps ✅ Confirm)
                                                         ↓
                 In stock → bot sends accounts ✅  ·  Out of stock → admin delivers manually 📝
```

## ⚡ Quick Start

### Requirements
- [Node.js](https://nodejs.org/) v18.17+ (or Docker)
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- A bank account supported by [VietQR](https://vietqr.io/)

### 1️⃣ Clone & install

```bash
git clone https://github.com/kentzu213/telegram-shop-bot.git
cd telegram-shop-bot
npm install
```

### 2️⃣ Configure

```bash
cp .env.example .env
```

Minimum settings:

```env
BOT_TOKEN=1234567890:ABCdefGhIjKlMnOpQrS     # from @BotFather
ADMIN_IDS=123456789                          # several admins: 111,222
BANK_BIN=970422                              # BIN list: vietqr.io/danh-sach-ngan-hang
BANK_ACCOUNT=1234567890
BANK_ACCOUNT_NAME=NGUYEN VAN A
BANK_NAME=MB
SHOP_NAME=My Shop
SUPPORT_CONTACT=@your_username
```

> 💡 Don't know your Telegram ID? Start the bot, send `/myid`, put it in `ADMIN_IDS` and restart.
> See [.env.example](.env.example) for all options.

### 3️⃣ Run

```bash
npm start            # normal
npm run dev          # auto-restart on changes
```

**Production (pick one):**

```bash
docker compose up -d --build                  # Docker (DB stored in ./data)
pm2 start ecosystem.config.js && pm2 save     # PM2
```

## 🤖 Automatic Payments (SePay)

1. Sign up at [sepay.vn](https://sepay.vn) and link the receiving bank account.
2. Expose `WEBHOOK_PORT` over HTTPS (Nginx, Caddy or Cloudflare Tunnel).
3. In SePay, create a **Webhook**:
   - URL: `https://<domain>/webhook/sepay`
   - Authentication: **API Key** — use the same value for `SEPAY_API_KEY` in `.env`.
4. Restart the bot. Each transaction is processed **exactly once** (de-duplicated by transaction ID):
   - Full amount → delivered immediately; overpayment → excess credited to balance.
   - Underpayment → bot asks for the remainder; transferring it with the same content completes the order.
   - Expired/cancelled order → the whole amount goes to balance (customers never lose money).
   - Content matching no order → admins are alerted.

> Without SePay the bot still works: admins tap **✅ Confirm** on the new-order notification (or `/confirm ID`).

## 📋 Commands

<details>
<summary><b>👤 User Commands</b></summary>

| Command | Description |
|---------|-------------|
| `/start` | 🔄 Start + quick menu |
| `/product` | 📦 Product list |
| `/donhang` | 🧾 My orders, re-view accounts, warranty |
| `/nap [amount]` | 💰 Top up balance (e.g. `/nap 50k`) |
| `/menu` | 👤 Account info & balance |
| `/support` | 🆘 Support |
| `/myid` | 🆔 Get Telegram ID |
| `/cancel` | ❌ Cancel current input |

</details>

<details>
<summary><b>🔧 Admin Commands</b></summary>

| Command | Description |
|---------|-------------|
| `/admin` | 📊 Admin dashboard |
| **Products** | |
| `/listproduct` | List all products (real stock, sheet stock, reserved) |
| `/addproduct catID \| name \| price` | Add product |
| `/addcategory name \| emoji` | Add category |
| `/editprice ID price` · `/editname ID name` | Edit price / name |
| `/setcategory ID catID` | Change category |
| `/setpromo ID X Y` | Buy X get Y free (`0 0` to disable) |
| `/setnote ID text` | Instructions sent with delivery (`-` = none, `default` = default) |
| `/toggleproduct ID` | Enable/disable product |
| `/deleteproduct ID` · `/restoreproduct ID` | Soft delete / restore (order history kept) |
| **Stock** | |
| `/addstock ID` | Add accounts by message or `.txt` file, duplicates skipped |
| `/viewstock ID` | View stock |
| `/clearstock ID` | Clear unsold stock (with confirmation) |
| `/tracuu keyword` | Find who bought an account, find order by ID / payment code |
| **Orders & money** | |
| `/pending` | Orders awaiting payment |
| `/awaiting` | Paid orders awaiting manual delivery |
| `/confirm ID` | ✅ Confirm & deliver |
| `/cancelorder ID` | Cancel order (auto refund to balance if paid) |
| `/orders` | Recent orders |
| `/warranty` | Open warranty claims |
| `/addbalance userID amount [note]` | Add/subtract customer balance |
| **Promotions** | |
| `/addcoupon CODE \| 10% \| uses \| min order \| days` | Create coupon |
| `/coupons` · `/delcoupon CODE` | List / disable coupons |
| **Settings** | |
| `/setbank` | View/edit bank 1 & 2 at runtime |
| `/setshop name \| @telegram \| zalo \| tagline` | Shop info & contacts |
| `/setwelcome` | Compose the welcome (banner, animated emoji) |
| `/seticon cat\|sp ID` | Icon for category / product buttons |
| `/sync` | Sync Google Sheet now |
| **Reports** | |
| `/stats` | Revenue today / 7 / 30 days, top products |
| `/export [days]` | Export orders as CSV (Excel-friendly) |
| `/users` | User list |
| `/backup` | Back up the database now |
| `/broadcast [text]` | Broadcast (text, photo, video...) with preview |

</details>

## 📦 Adding Stock

```bash
# Step 1: Send command with product ID
/addstock 1

# Step 2: Send account list (one per line) — or upload a .txt file
email1@example.com|password1|extra_info1
email2@example.com|password2|extra_info2
```

Stock is **reserved for pending orders**, so the bot never oversells. When stock drops below `LOW_STOCK_THRESHOLD`, admins are notified.

## 📊 Google Sheet Sync (optional)

| Column | Content |
|--------|---------|
| A | ID |
| B | Product name |
| C | Price |
| D | Unit |
| E | Stock quantity |
| F | In stock (TRUE/FALSE) |
| G | Contact link (Zalo...) |
| H | Notes / Promotion |
| I | Category (optional, created if missing) |

**Setup:**
1. **Share → "Anyone with the link can view"**
2. Copy the Sheet ID from the URL: `docs.google.com/spreadsheets/d/[SHEET_ID]/edit`
3. Add to `.env`:
```env
GOOGLE_SHEET_ID=your_sheet_id
SHEET_SYNC_INTERVAL=5
```

Products removed from the sheet are deactivated. An empty or broken sheet is skipped instead of disabling everything.

## 🎨 Look & Branding

- **Buttons colored by availability:** 🟢 in stock · 🔵 contact · 🔴 sold out, so customers see at a glance what they can buy.
- **Shop on the first screen:** `/start` shows the welcome together with the category grid. It uses 2 or 3 columns depending on name length, so labels are not cut off.
- **`/setwelcome`:** compose the welcome right in Telegram (banner photo, animated emoji, bold, links). `{name}` becomes the customer's name, `{shop}` the shop name.
- **`/seticon cat ID`:** send one custom (animated) emoji, e.g. a ChatGPT or Canva logo, to use as the category button icon. The bot test-sends it before saving.
- **`/setshop name | @telegram | zalo | tagline`:** contact info shown in the welcome, with buttons that open Zalo/Telegram.

**Ready-made AI catalog & logos:**

```bash
node scripts/seed-ai-catalog.js      # import 20 AI software categories (safe to re-run)
node scripts/create-logo-emoji.js    # build a logo emoji pack from assets/logos/ and attach it to buttons
```

> Custom emoji in messages and on buttons only work if **the bot owner's account has Telegram Premium** (a Telegram rule). Colored buttons work for every bot.

## 🏦 Multi-Bank Support

Add a second bank in `.env`, or use `/setbank 2 BIN | ACCOUNT | NAME | BANK` at runtime:

```env
BANK2_BIN=970436
BANK2_ACCOUNT=9876543210
BANK2_ACCOUNT_NAME=NGUYEN VAN A
BANK2_NAME=VCB
```

## 🧪 Testing

```bash
npm run check        # ESLint + full test suite (node:test)
```

## 🛠 Tech Stack

| Technology | Description |
|------------|-------------|
| [Node.js](https://nodejs.org/) | JavaScript runtime |
| [Telegraf v4](https://github.com/telegraf/telegraf) | Telegram Bot Framework |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | SQLite database (WAL, transactions) |
| [Express](https://expressjs.com/) | SePay / Telegram webhooks |
| [VietQR API](https://vietqr.io/) | Payment QR generation |
| [nanoid](https://github.com/ai/nanoid) | Unique payment codes |

## 📁 Project Structure

```
telegram-shop-bot/
├── .env.example            # Config template (copy → .env)
├── Dockerfile · docker-compose.yml · ecosystem.config.js
├── data/                   # SQLite database + backups (auto-created)
├── test/                   # Tests (node:test)
└── src/
    ├── bot.js              # 🚀 Entry point: polling/webhook, starts jobs
    ├── app.js              # Registers middlewares & handlers
    ├── config.js           # ⚙️ Config + validation
    ├── database.js         # 💾 Schema, migrations, indexes
    ├── server.js           # 🌐 /health, SePay & Telegram webhooks
    ├── jobs.js             # ⏰ Order expiry, daily report, backup
    ├── middlewares.js      # Anti-spam, user tracking
    ├── commands/           # 📋 Customer commands: start, product, orders, nap
    ├── handlers/           # ⚡ productSelect, checkout, warranty, stateRouter
    │   └── admin/          # 🔧 panel, products, stock, orders, coupons, settings, reports, broadcast
    ├── services/           # 🔧 Business logic (order, payment, delivery, topup, coupon, ...)
    └── utils/              # 🎨 messages, keyboard, format, csv, reply
```

## 📞 Contact & Support

Need help with setup, customization, or have questions?

| Channel | Contact |
|---------|---------|
| 💬 **Telegram** | [@kentng](https://t.me/kentng) |
| 📱 **Zalo Group** | [Join group chat](https://zalo.me/g/agaxxc699) |
| 🐛 **Bug Report** | [Open Issue](https://github.com/kentzu213/telegram-shop-bot/issues) |

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

## 📄 License

[MIT](LICENSE) © 2026 [kentzu213](https://github.com/kentzu213)

---

<p align="center">
  If this project helped you, please ⭐ <b>star</b> the repo!<br/>
  💬 Contact: <a href="https://t.me/kentng">@kentng</a> | 📱 <a href="https://zalo.me/g/agaxxc699">Zalo Group</a>
</p>
