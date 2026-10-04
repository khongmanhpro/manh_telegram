require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, chunkText, bonusFor, formatPrice } = require('../src/utils/format');
const { parseCSV, toCSV } = require('../src/utils/csv');
const paymentService = require('../src/services/paymentService');
const { parseAmount } = require('../src/commands/nap');

test('escapeHtml escapes Telegram HTML special chars', () => {
    assert.equal(escapeHtml('a<b>&"c'), 'a&lt;b&gt;&amp;&quot;c');
    assert.equal(escapeHtml(null), '');
});

test('formatPrice uses vi-VN grouping', () => {
    assert.equal(formatPrice(1234567), '1.234.567đ');
});

test('chunkText keeps every chunk under the limit and loses nothing', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i} <code>${'x'.repeat(40)}</code>`);
    const text = lines.join('\n');
    const chunks = chunkText(text, 1000);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((c) => c.length <= 1000));
    assert.equal(chunks.join('\n'), text);
    assert.ok(chunkText('y'.repeat(2500), 1000).every((c) => c.length <= 1000));
});

test('chunkText never splits inside a blockquote', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `${i}. <code>${'a'.repeat(50)}</code>`);
    const text = `${lines.join('\n')}\n\n<blockquote expandable><b>Note</b>\nline 1\nline 2</blockquote>`;
    for (const chunk of chunkText(text, 1500)) {
        assert.equal((chunk.match(/<blockquote/g) || []).length, (chunk.match(/<\/blockquote>/g) || []).length);
    }
});

test('bonusFor implements "mua X tặng Y"', () => {
    const p = { bonus_buy: 10, bonus_free: 2 };
    assert.equal(bonusFor(p, 9), 0);
    assert.equal(bonusFor(p, 10), 2);
    assert.equal(bonusFor(p, 25), 4);
    assert.equal(bonusFor({}, 25), 0);
});

test('parseCSV handles quotes, commas, escaped quotes and multiline fields', () => {
    const csv = '\uFEFFID,Name,Note\r\n1,"A, B","say ""hi"""\n2,C,"line1\nline2"\n\n';
    assert.deepEqual(parseCSV(csv), [
        ['ID', 'Name', 'Note'],
        ['1', 'A, B', 'say "hi"'],
        ['2', 'C', 'line1\nline2'],
    ]);
});

test('toCSV round-trips through parseCSV', () => {
    const rows = [['a', 'b,c'], ['"q"', 'x\ny']];
    assert.deepEqual(parseCSV(toCSV(rows)), rows);
});

test('payment codes are alphanumeric with the right prefix', () => {
    assert.match(paymentService.generatePaymentCode('order'), /^DH[A-Z2-9]{8}$/);
    assert.match(paymentService.generatePaymentCode('topup'), /^NAP[A-Z2-9]{8}$/);
});

test('extractCodes finds codes despite bank formatting', () => {
    assert.ok(paymentService.extractCodes('MBVCB.123.dh abcd-2345.CT tu 0123').includes('DHABCD2345'));
    assert.ok(paymentService.extractCodes('NAPXYZW2345 FT2401').includes('NAPXYZW2345'));
    assert.ok(paymentService.extractCodes('chuyen tien NAP PAY-AB12CD').includes('NAP PAY-AB12CD'));
    assert.deepEqual(paymentService.extractCodes(''), []);
});

test('parseAmount accepts common formats', () => {
    assert.equal(parseAmount('50000'), 50000);
    assert.equal(parseAmount('50.000'), 50000);
    assert.equal(parseAmount('50k'), 50000);
    assert.ok(Number.isNaN(parseAmount('abc')));
});

test('applyPlaceholders replaces {name} and keeps entity positions correct', () => {
    const { applyPlaceholders } = require('../src/utils/entities');
    const text = 'Chào {name}! Tới {shop} nhé';
    // bold "Chào {name}!" (0..12), custom emoji on "nhé" (24..27)
    const entities = [
        { type: 'bold', offset: 0, length: 12 },
        { type: 'custom_emoji', offset: 24, length: 3, custom_emoji_id: '1' },
    ];
    const res = applyPlaceholders(text, entities, { name: 'Mạnh 👋', shop: 'AI Shop' });
    assert.equal(res.text, 'Chào Mạnh 👋! Tới AI Shop nhé');
    const bold = res.entities[0];
    assert.equal(res.text.slice(bold.offset, bold.offset + bold.length), 'Chào Mạnh 👋!');
    const emoji = res.entities[1];
    assert.equal(res.text.slice(emoji.offset, emoji.offset + emoji.length), 'nhé');
    assert.deepEqual(applyPlaceholders('no vars', entities).entities, entities);
});

test('firstCustomEmojiId reads text and caption entities', () => {
    const { firstCustomEmojiId } = require('../src/utils/entities');
    assert.equal(firstCustomEmojiId({ entities: [{ type: 'bold' }, { type: 'custom_emoji', custom_emoji_id: '42' }] }), '42');
    assert.equal(firstCustomEmojiId({ caption_entities: [{ type: 'custom_emoji', custom_emoji_id: '7' }] }), '7');
    assert.equal(firstCustomEmojiId({ text: 'x' }), null);
});

test('buttons are colored by availability and grid columns fit labels', () => {
    const { homeKeyboard } = require('../src/utils/keyboard');
    require('../src/services/settingsService').set('custom_icons', '1');
    const categories = [
        { id: 1, name: 'CHATGPT', emoji: '🤖', available: 2, contact: 0 },
        { id: 2, name: 'CANVA', emoji: '🎨', available: 0, contact: 1, icon_emoji_id: '555' },
        { id: 3, name: 'KLING', emoji: '🎬', available: 0, contact: 0 },
    ];
    const rows = homeKeyboard({ categories, products: [] }).reply_markup.inline_keyboard;
    assert.equal(rows[0].length, 3, 'short names → 3 columns');
    assert.deepEqual(rows[0].map((b) => b.style), ['success', 'primary', 'danger']);
    assert.equal(rows[0][1].icon_custom_emoji_id, '555');
    assert.equal(rows[0][1].text, 'CANVA', 'custom icon replaces the text emoji');
    assert.ok(rows.flat().some((b) => b.callback_data === 'my_orders'), 'navigation row present');
});

test('packRows keeps order: 3 short per row, long labels 2 per row', () => {
    const { packRows } = require('../src/utils/keyboard');
    const rows = packRows(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [3, 3, 3, 3, 2, 3, 3]);
    assert.deepEqual(rows, [['a', 'b', 'c'], ['d', 'e'], ['f', 'g']]);
});
