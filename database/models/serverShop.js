
const mongoose = require('mongoose');

const serverShopSchema = new mongoose.Schema({
    serverID: { 
        type: String, 
        required: true, 
        index: true 
    },
    items: [{
        id: {
            type: String,
            required: true,
            default: () => require('crypto').randomBytes(16).toString('hex')
        },
        name: {
            type: String,
            required: true,
            maxlength: 50
        },
        description: {
            type: String,
            maxlength: 200
        },
        price: {
            type: Number,
            required: true,
            min: 1,
            max: 1000
        },
        roleID: {
            type: String,
            required: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    totalRevenue: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
});

module.exports = mongoose.model('ServerShop', serverShopSchema);
