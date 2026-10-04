// Keep message rendering outside queue persistence to avoid module cycles at startup.
module.exports.deliveryText = (order) => require('../utils/messages').orderDelivered(order,order.delivery_data.split('\n'));
