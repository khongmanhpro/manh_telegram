require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { syncToDatabase, parsePrice } = require('../src/services/sheetSync');
const productService = require('../src/services/productService');
const { parseCSV } = require('../src/utils/csv');

const HEADER = 'ID,Sản phẩm,Giá bán,Đơn vị,Số lượng,Còn hàng,Liên hệ,Ghi chú,Danh mục';

test('parsePrice', () => {
    assert.equal(parsePrice('8.000đ'), 8000);
    assert.equal(parsePrice('1,200,000 VND'), 1200000);
    assert.equal(parsePrice(''), 0);
});

test('sync inserts, updates, assigns categories and deactivates removed rows', () => {
    const first = syncToDatabase(parseCSV(`${HEADER}\n101,Netflix 1 tháng,"50.000đ",tháng,5,TRUE,,Hot,Giải trí\n102,Spotify,30000,tháng,0,TRUE,https://zalo.me/g/x,,`));
    assert.equal(first.added, 2);

    const netflix = productService.getById(101);
    assert.equal(netflix.price, 50000);
    assert.equal(netflix.cat_name, 'Giải trí');
    assert.equal(netflix.display_stock, 5);
    assert.equal(productService.getById(102).contact_only, 1);

    const second = syncToDatabase(parseCSV(`${HEADER}\n101,Netflix 1 tháng,55000,tháng,4,TRUE,,,Giải trí`));
    assert.equal(second.updated, 1);
    assert.equal(second.deactivated, 1);
    assert.equal(productService.getById(102).is_active, 0);
    assert.equal(productService.getById(101).price, 55000);
});

test('sync refuses an empty sheet instead of disabling everything', () => {
    assert.throws(() => syncToDatabase(parseCSV(HEADER)));
    assert.equal(productService.getById(101).is_active, 1);
});

test('sync does not resurrect products deleted by admin', () => {
    productService.update(101, { is_deleted: 1, is_active: 0 });
    syncToDatabase(parseCSV(`${HEADER}\n101,Netflix,55000,,4,TRUE,,,\n103,Other,1000,,1,TRUE,,,`));
    assert.equal(productService.getById(101).is_deleted, 1);
    assert.equal(productService.getById(101).is_active, 0);
});
