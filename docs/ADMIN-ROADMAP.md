# Roadmap giao diện quản trị Telegram Shop Bot

Ngày lập: 03/10/2026. Trạng thái: đề xuất triển khai; chưa xây dựng giao diện.

## Mục tiêu và phạm vi

Chủ shop quản lý hàng hóa, kho và đơn hàng bằng giao diện tiếng Việt trên máy tính và điện thoại. Luồng thường ngày: mở trang quản trị → thêm sản phẩm → nhập kho → kiểm tra sản phẩm trên bot → theo dõi và xử lý đơn.

Giả định ban đầu: một shop, một máy chủ ứng dụng, chủ shop là người quản trị đầu tiên. Bản đầu dùng web quản trị tại `/admin`; khách tiếp tục mua hàng trên Telegram. Lệnh admin Telegram được giữ lại và dùng chung nghiệp vụ với web.

Phạm vi bản đầu: đăng nhập, tổng quan cơ bản, danh mục, sản phẩm, kho, tra cứu đơn và xử lý đơn. Các tính năng nhiều shop, website bán hàng riêng, ứng dụng di động riêng và tự động hóa marketing nâng cao chưa nằm trong bản đầu.

## Hiện trạng đã kiểm tra

| Thành phần | Đã có | Phần cần bổ sung |
|---|---|---|
| HTTP server | Express, health check, webhook thanh toán và Telegram | Giao diện, API quản trị, đăng nhập và kiểm tra quyền web |
| Danh mục, sản phẩm | Tạo/sửa qua lệnh, giá, icon, bật/tắt, xóa mềm, khuyến mãi mua tặng | Biểu mẫu, tìm kiếm, phân trang, sửa đầy đủ trường, xem trước |
| Kho | Nhập văn bản/file qua Telegram, bỏ trùng trong lô và kho chưa bán của cùng sản phẩm, tính số lượng đang giữ | Xem trước nhập, kết quả từng dòng, che nội dung tài khoản, lịch sử nhập |
| Đơn hàng | Thanh toán, giao tự động/thủ công, hủy và hoàn vào ví | Bộ lọc, trang chi tiết, nút thao tác theo trạng thái, nhật ký |
| Khách hàng | Hồ sơ Telegram, số dư, cộng/trừ ví | Sổ biến động ví và phân quyền thao tác |
| Vận hành | Bảo hành, coupon, broadcast, báo cáo, backup, cài đặt qua bot | Màn hình quản trị tương ứng |
| Google Sheet | Đồng bộ theo ID, cập nhật nhiều trường sản phẩm | Quy tắc nguồn dữ liệu, phát hiện xung đột, lịch sử đồng bộ |

Căn cứ: `src/server.js`, `src/database.js`, `src/services/productService.js`, `src/services/orderService.js`, `src/services/sheetSync.js`, `src/services/settingsService.js`, `src/handlers/admin/`, `scripts/seed-ai-catalog.js`. Đây là kết quả đọc mã nguồn, chưa kiểm tra hệ thống đang chạy hoặc dữ liệu thật.

## Giao diện đề xuất

Thanh điều hướng: Tổng quan · Sản phẩm · Danh mục · Kho hàng · Đơn hàng · Khách hàng · Thanh toán & ví · Bảo hành · Khuyến mãi · Thông báo · Cài đặt.

Trang mở đầu ưu tiên việc cần xử lý: đơn đã trả tiền đang chờ giao, hàng sắp hết, bảo hành chưa xử lý, giao dịch chưa khớp. Các thẻ số liệu và biểu đồ chỉ hiển thị giá trị tính được từ dữ liệu thật.

| Màn hình | Thao tác chính | Ưu tiên |
|---|---|---|
| Sản phẩm | Tìm/lọc, thêm/sửa, nhân bản thành sản phẩm đang tắt, bật/tắt, xóa mềm/khôi phục | P0 |
| Danh mục | Thêm/sửa tên, icon, thứ tự; chuyển sản phẩm giữa danh mục | P0 |
| Kho hàng | Dán danh sách hoặc tải TXT/CSV; xem trước; lọc trùng; xem tồn chưa bán, đang giữ, có thể bán; tra hàng theo đơn | P0 |
| Đơn hàng | Lọc theo trạng thái/ngày/khách; xem chi tiết; xác nhận thanh toán; giao thủ công; hủy theo điều kiện | P0 |
| Tổng quan | Đơn cần xử lý, sản phẩm sắp hết, doanh thu theo định nghĩa thống nhất | P0 cơ bản |
| Khách hàng & ví | Lịch sử mua, số dư, biến động ví; điều chỉnh có lý do và quyền phù hợp | P1 |
| Thanh toán | Tra giao dịch, đơn/nạp tiền liên quan, giao dịch chưa khớp; đối soát thủ công có kiểm soát | P1 |
| Bảo hành | Hàng đợi yêu cầu, xem đơn gốc, đổi hàng, ghi kết quả xử lý | P1 |
| Khuyến mãi | Coupon, giới hạn sử dụng, ngày hết hạn, mua X tặng Y | P1 |
| Cài đặt shop | Tên, liên hệ, lời chào, hướng dẫn giao; cấu hình ngân hàng cho chủ shop | P1 |
| Báo cáo | Lọc kỳ, sản phẩm bán chạy, xuất CSV; tách doanh thu bán hàng khỏi tiền nạp ví | P1 |
| Thông báo | Soạn, xem trước, chọn đối tượng, xác nhận gửi; tiến độ và lỗi | P2 |
| Vận hành | Tình trạng tích hợp, lịch sử đồng bộ/backup, phân quyền nhân viên, nhật ký thao tác | P0 nhật ký; P2 mở rộng |

### Biểu mẫu thêm sản phẩm

- Thông tin: tên, danh mục, mô tả, giá VND, icon, trạng thái bán.
- Cách giao: từ kho tài khoản, giao thủ công hoặc liên hệ tư vấn. Đây là mô hình giao diện đề xuất; cần ánh xạ rõ vào dữ liệu hiện có trước khi triển khai.
- Nội dung: hướng dẫn giao hàng, đường dẫn liên hệ, chương trình mua tặng.
- Kho: nút “Lưu và nhập kho”; phân biệt tài khoản giao được với số lượng khai báo cho hàng thủ công.
- Xem trước: cách sản phẩm xuất hiện trong menu Telegram; báo lỗi ngay tại trường nhập.
- Kiểm tra tại máy chủ: giá và số lượng hợp lệ, danh mục tồn tại, liên kết hợp lệ, không bật bán khi thiếu thông tin bắt buộc.

### Trải nghiệm chung

Giao diện sáng, ưu tiên bảng dễ đọc và nút thao tác rõ ràng. Mỗi trang có trạng thái đang tải, trống, lỗi và lưu thành công. Điện thoại dùng danh sách thẻ hoặc bảng cuộn có nhãn rõ. Hỗ trợ bàn phím, nhãn cho biểu mẫu và trạng thái không chỉ dựa vào màu. Ngày giờ hiển thị theo Asia/Ho_Chi_Minh, tiền theo VND.

## Quyết định kiến trúc cần thực hiện

1. Dùng Express hiện có phục vụ `/admin` và `/api/admin/*`. API gọi các service chung; tách những nghiệp vụ còn gắn với handler Telegram để dùng lại. Giao diện không tự sửa trạng thái đơn, trừ kho hoặc cập nhật số dư độc lập.
2. Giữ SQLite cho giả định một máy chủ; trình duyệt chỉ truy cập qua API. Đánh giá chuyển hệ quản trị dữ liệu khi có nhu cầu nhiều máy chủ ghi đồng thời hoặc bằng chứng nghẽn ghi. Đây là lựa chọn cho phạm vi hiện tại, không phải kết luận về tải thực tế. [Tham khảo SQLite](https://www.sqlite.org/whentouse.html).
3. Chọn web làm nơi quản lý chính cho sản phẩm chuyển sang quản trị web. Sheet chỉ cập nhật sản phẩm được đánh dấu thuộc Sheet; không chỉ dựa vào ID trùng nhau. Chuyển quyền quản lý phải hiện bản so sánh và xác nhận; chưa thay đổi cấu hình đồng bộ hiện tại trong bước lập kế hoạch.
4. Xây đăng nhập quản trị riêng và phiên đăng nhập phía máy chủ; không dùng bot token hay khóa webhook làm mật khẩu quản trị. Kiểm tra quyền ở mọi API. Khi đưa lên live dùng HTTPS, cookie bảo vệ phù hợp, chống giả mạo yêu cầu và giới hạn thử đăng nhập. [Hướng dẫn Express](https://expressjs.com/en/advanced/best-practice-security/).
5. Thêm nhật ký ngay từ P0: ai làm gì, đối tượng, thời gian, kết quả; không ghi mật khẩu/tài khoản kho hoặc khóa bí mật vào log. Che nội dung kho mặc định, chỉ trả nội dung khi người có quyền yêu cầu xem.
6. Bổ sung sổ biến động ví trước khi mở điều chỉnh ví trên web. Ghi nhận thay đổi số dư và bút toán trong cùng giao dịch dữ liệu, gồm cả các luồng bot/webhook. Dữ liệu cũ có số dư mở đầu, không tự tạo lịch sử không có bằng chứng.
7. Phân biệt “đã cấp hàng” với “đã gửi tin Telegram thành công”; gửi lại tin phải dùng đúng hàng đã cấp, không trừ kho lần nữa. Bảo vệ thao tác lặp và hai người cùng sửa; phản hồi xung đột để tải lại dữ liệu.

## Roadmap theo mốc nghiệm thu

### Mốc 1 — Nền tảng quản trị

Đầu ra: khung giao diện, đăng nhập/đăng xuất, bảo vệ API, nhật ký, dữ liệu thử và tổng quan cơ bản. Chốt nguồn dữ liệu web/Sheet cùng cách biểu diễn các kiểu giao hàng.

Nghiệm thu: người chưa đăng nhập không đọc hoặc sửa được dữ liệu quản trị; phiên hết hạn bị chặn; các webhook hiện có vẫn dùng cơ chế xác thực riêng; màn hình hoạt động trên máy tính và điện thoại.

### Mốc 2 — Sản phẩm, danh mục và kho

Đầu ra: biểu mẫu sản phẩm/danh mục, sắp xếp, nhân bản, xóa mềm/khôi phục, nhập kho TXT/CSV có xem trước. CSV có định dạng mẫu rõ ràng. Lưu lịch sử lô nhập và kết quả lỗi/trùng.

Nghiệm thu: quản trị viên tạo danh mục → tạo sản phẩm → nhập kho → thấy sản phẩm đúng trên bot mà không sửa code. Nhập lại cùng lô không làm tăng kho sai; thay đổi từ web không bị lần đồng bộ Sheet tiếp theo ghi đè trái quy tắc.

### Mốc 3 — Đơn hàng và bản dùng được đầu tiên

Đầu ra: tìm/lọc đơn, chi tiết đơn, xác nhận thanh toán, giao thủ công, hủy và hoàn ví theo nghiệp vụ hiện tại. Thao tác ảnh hưởng tiền/hàng có màn xác nhận nêu tác động và lý do.

Nghiệm thu: mua thử qua bot → thanh toán giả lập → cập nhật đơn trên web → giao đúng số hàng. Bấm lặp hoặc webhook đến cùng lúc không giao/hoàn hai lần. Hủy đơn không làm sai kho đang giữ; lỗi gửi Telegram hiển thị rõ.

**Kết thúc mốc 3 là MVP:** chủ shop làm được việc nhập hàng, sửa sản phẩm và xử lý đơn hằng ngày trên web.

### Mốc 4 — Chăm sóc khách hàng và quản lý tiền

Đầu ra: khách hàng, sổ biến động ví, đối soát thanh toán, bảo hành, coupon, cài đặt shop/ngân hàng, báo cáo và CSV. Tách tiền nạp ví, tiền bán hàng và hoàn tiền trong báo cáo.

Nghiệm thu: truy vết được mỗi điều chỉnh ví mới; bảo hành liên kết đơn gốc và hàng thay thế; số liệu báo cáo khớp bộ dữ liệu thử; xuất CSV không chứa bí mật ngoài quyền cho phép và xử lý nội dung có thể bị bảng tính hiểu là công thức.

### Mốc 5 — Vận hành nhiều người và tăng trưởng

Đầu ra: vai trò Chủ shop / Nhân viên đơn hàng / Nhân viên kho; thông báo có xem trước và xác nhận; quản lý đồng bộ/backup, cảnh báo vận hành.

Nghiệm thu: từng vai trò chỉ thấy và thao tác dữ liệu cần thiết; gửi thông báo có trạng thái hoàn thành/thất bại; diễn tập khôi phục trên bản sao dữ liệu trước khi cho phép khôi phục vận hành.

Các mốc thể hiện thứ tự phụ thuộc, chưa phải cam kết ngày bàn giao. Ước lượng thời gian sau khi chốt thiết kế màn hình và cách đăng nhập.

## Checklist triển khai

- [ ] Chốt luồng sử dụng, kiểu giao hàng và quy tắc nguồn dữ liệu web/Sheet.
- [ ] Thiết kế màn tổng quan, bảng sản phẩm, form sản phẩm, nhập kho và chi tiết đơn cho desktop/mobile.
- [ ] Tách nghiệp vụ dùng chung cần thiết từ handler Telegram; thêm phân trang và kiểm tra dữ liệu ở API.
- [ ] Bổ sung đăng nhập, phiên, kiểm tra quyền và migration nhật ký quản trị.
- [ ] Xây quản lý danh mục/sản phẩm và chống xung đột đồng bộ.
- [ ] Xây nhập kho có xem trước, lọc trùng và tra cứu có che nội dung.
- [ ] Xây chi tiết/thao tác đơn với bảo vệ xử lý lặp và nhật ký.
- [ ] Kiểm tra luồng thật trên môi trường thử; chạy kiểm tra hiện có và kiểm tra API mới phù hợp.
- [ ] Hoàn thiện ví, thanh toán, bảo hành, khuyến mãi và báo cáo theo mốc 4.
- [ ] Chuẩn bị bản triển khai, sao lưu và phương án quay lại; xin duyệt trước khi đưa lên live, sau đó mở rộng mốc 5.

## Điều kiện kiểm chứng trước khi đưa lên live

- Dùng dữ liệu thử và Telegram bot thử; không gửi tin hàng loạt hay thực hiện giao dịch thật trong kiểm tra.
- Các kiểm tra hiện có về đơn, thanh toán, Sheet và bot tiếp tục đạt; kiểm tra bổ sung tập trung vào phân quyền, nguồn dữ liệu, kho, xử lý lặp và ví.
- Kiểm tra bằng trình duyệt: đăng nhập → tạo sản phẩm → nhập hàng → tra đơn → xử lý → đăng xuất; kiểm tra cả màn hình hẹp và bàn phím.
- Kiểm tra migration trên bản sao dữ liệu; giữ nguyên lịch sử đơn và hàng đã bán. Có bản sao lưu và hướng dẫn quay lại phiên bản trước.
- Người dùng duyệt bản chạy thử và tác động triển khai trước khi mở giao diện quản trị trên live.

## Chức năng cân nhắc sau roadmap chính

- Giá vốn theo lô, nhà cung cấp và lợi nhuận: cần thêm dữ liệu giá vốn; chưa suy ra lợi nhuận từ doanh thu hiện có.
- Hạn dùng tài khoản, nhắc gia hạn và thời hạn bảo hành theo sản phẩm: cần bổ sung mô hình dữ liệu và quy tắc thời gian.
- Giá sỉ/đại lý và phân nhóm khách: triển khai khi có nhu cầu thực tế và kiểm thử lại tính giá/khuyến mãi.
- Hàng đợi công việc và nhiều máy chủ: đánh giá dựa trên tải đo được, số tác vụ nền và yêu cầu vận hành.
