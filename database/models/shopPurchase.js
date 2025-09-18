
const mongoose = require('mongoose');

const shopPurchaseSchema = new mongoose.Schema({
    serverID: {
        type: String,
        required: true,
        index: true
    },
    buyerID: {
        type: String,
        required: true
    },
    buyerUsername: {
        type: String,
        required: true
    },
    itemId: {
        type: String,
        required: true
    },
    itemName: {
        type: String,
        required: true
    },
    roleID: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    stripeSessionId: {
        type: String,
        required: true
    },
    stripePaymentIntentId: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'pending'
    },
    roleGranted: {
        type: Boolean,
        default: false
    },
    errorMessage: {
        type: String
    },
    purchaseDate: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ShopPurchase', shopPurchaseSchema);
