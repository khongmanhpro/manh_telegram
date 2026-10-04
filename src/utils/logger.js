function log(level, args) {
    const ts = new Date().toISOString();
    const fn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
    fn(`[${ts}] ${level}`, ...args);
}

module.exports = {
    info: (...args) => log('INFO', args),
    warn: (...args) => log('WARN', args),
    error: (...args) => log('ERROR', args),
};
