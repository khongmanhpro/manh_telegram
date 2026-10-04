module.exports = (bot) => {
    require('./panel')(bot);
    require('./products')(bot);
    require('./stock')(bot);
    require('./orders')(bot);
    require('./coupons')(bot);
    require('./settings')(bot);
    require('./reports')(bot);
    require('./broadcast')(bot);
};
