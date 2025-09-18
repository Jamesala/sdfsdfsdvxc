// routes/api/notifications.js
const express = require("express");
const router = express.Router();
const Notification = require("../../database/models/Notification");

router.get("/active", async (req, res) => {
    try {
        const now = new Date();
        const notifications = await Notification.find({
            isActive: true,
            $or: [
                { expiresAt: { $exists: false } },
                { expiresAt: null },
                { expiresAt: { $gt: now } }
            ]
        }).sort({ createdAt: -1 }).limit(5);
        
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;