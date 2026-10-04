const config = require('../config');
const { customAlphabet } = require('nanoid');

// No 0/O/1/I to avoid confusion when customers type the code manually
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;
const generateId = customAlphabet(ALPHABET, CODE_LEN);

// Alphanumeric only: many banks strip spaces/dashes from the transfer content
const PREFIX = { order: 'DH', topup: 'NAP' };

const paymentService = {
    PREFIX,

    getBanks() {
        const banks = [config.BANK];
        if (config.BANK2) banks.push(config.BANK2);
        return banks;
    },

    getBank(index) {
        if (index === 1 && config.BANK2) return config.BANK2;
        return config.BANK;
    },

    /**
     * A bank is usable only with account number and holder name (VietQR returns 404 otherwise)
     */
    isConfigured(bankIndex = 0) {
        const b = this.getBank(bankIndex);
        return !!(b && /^\d{6}$/.test(b.BIN) && b.ACCOUNT && b.ACCOUNT_NAME);
    },

    /**
     * Download the QR image ourselves (more reliable than letting Telegram fetch the URL).
     * Returns a Buffer or null.
     */
    async fetchQrImage(url) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) return null;
            return Buffer.from(await res.arrayBuffer());
        } catch {
            return null;
        }
    },

    generatePaymentCode(kind = 'order') {
        return `${PREFIX[kind]}${generateId()}`;
    },

    generateQRUrl(amount, content, bank = null) {
        const b = bank || config.BANK;
        return (
            `https://img.vietqr.io/image/${b.BIN}-${b.ACCOUNT}-compact2.png` +
            `?amount=${amount}` +
            `&addInfo=${encodeURIComponent(content)}` +
            `&accountName=${encodeURIComponent(b.ACCOUNT_NAME)}`
        );
    },

    generatePayment(amount, bankIndex = 0, kind = 'order') {
        const bank = this.getBank(bankIndex);
        const paymentCode = this.generatePaymentCode(kind);
        return {
            paymentCode,
            qrUrl: this.generateQRUrl(amount, paymentCode, bank),
            bankName: bank.NAME,
            accountNumber: bank.ACCOUNT,
            accountName: bank.ACCOUNT_NAME,
            amount,
        };
    },

    /**
     * Extract candidate payment codes from a bank transfer description.
     * Banks may add prefixes/suffixes, change case or strip separators,
     * so we scan the normalized text for every prefix occurrence.
     */
    extractCodes(content) {
        const normalized = String(content || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const codes = new Set();

        for (const prefix of Object.values(PREFIX)) {
            let idx = normalized.indexOf(prefix);
            while (idx !== -1) {
                const body = normalized.slice(idx + prefix.length, idx + prefix.length + CODE_LEN);
                if (body.length === CODE_LEN) codes.add(prefix + body);
                idx = normalized.indexOf(prefix, idx + 1);
            }
        }

        // Legacy format from older versions: "NAP PAY-XXXXXX"
        const legacy = normalized.match(/NAPPAY([A-Z0-9]{6})/);
        if (legacy) codes.add(`NAP PAY-${legacy[1]}`);

        return [...codes];
    },
};

module.exports = paymentService;
