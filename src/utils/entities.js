/**
 * Helpers for messages stored as text + Telegram entities (keeps custom emoji,
 * bold, links... exactly as the admin typed them). Offsets are UTF-16 code units,
 * which matches JavaScript string indexing.
 */

const PLACEHOLDER = /\{(name|full_name|shop)\}/g;

/**
 * Replace {name} / {full_name} / {shop} and shift entity offsets accordingly
 */
function applyPlaceholders(text, entities = [], vars = {}) {
    const reps = [];
    let out = '';
    let last = 0;
    for (const m of String(text).matchAll(PLACEHOLDER)) {
        const key = m[1] === 'full_name' ? 'name' : m[1];
        const value = String(vars[key] ?? '');
        out += text.slice(last, m.index) + value;
        reps.push({ start: m.index, end: m.index + m[0].length, newLen: value.length });
        last = m.index + m[0].length;
    }
    out += String(text).slice(last);
    if (reps.length === 0) return { text: String(text), entities };

    const mapPos = (pos) => {
        let shift = 0;
        for (const r of reps) {
            if (pos >= r.end) shift += r.newLen - (r.end - r.start);
            else if (pos > r.start) return r.start + shift + r.newLen; // inside a placeholder
            else break;
        }
        return pos + shift;
    };

    const mapped = entities
        .map((e) => {
            const start = mapPos(e.offset);
            const end = mapPos(e.offset + e.length);
            return { ...e, offset: start, length: end - start };
        })
        .filter((e) => e.length > 0);
    return { text: out, entities: mapped };
}

/**
 * First custom emoji id in a message (text or caption), or null
 */
function firstCustomEmojiId(message) {
    const entities = message?.entities || message?.caption_entities || [];
    const found = entities.find((e) => e.type === 'custom_emoji');
    return found ? found.custom_emoji_id : null;
}

module.exports = { applyPlaceholders, firstCustomEmojiId };
