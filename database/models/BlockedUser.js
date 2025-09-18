// models/BlockedUser.js
const mongoose = require("mongoose");

const blockedUserSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    reason: {
        type: String,
        required: true,
    },
    dateBlocked: {
        type: Date,
        default: Date.now,
    },
});

const BlockedUser = mongoose.model("BlockedUser", blockedUserSchema);

module.exports = BlockedUser;

