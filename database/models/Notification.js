// models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    icon: {
        type: String,
        default: "fas fa-info-circle",
    },
    type: {
        type: String,
        enum: ["info", "warning", "error", "success"],
        default: "info",
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    expiresAt: {
        type: Date,
        required: false,
    },
});

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;