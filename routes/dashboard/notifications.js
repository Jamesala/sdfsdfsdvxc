// routes/dashboard/notifications.js
const app = require("express").Router();
const Notification = require("../../database/models/Notification");

console.log("[Dashboard] /notifications router loaded.".brightYellow);

app.route("/dashboard/notifications")
    .get(async (req, res) => {
        if (!req.isAuthenticated()) return res.render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "You need to be logged in to view this page."
        });

        if (!config.client.owners.includes(req.user.id)) return res.render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "You cannot access this page."
        });

        const notifications = await Notification.find().sort({ createdAt: -1 });

        res.render("dashboard/notifications", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            notifications: notifications
        });
    })
    .post(async (req, res) => {
        const { title, content, icon, type, expiresAt } = req.body;

        if (!title || !content) {
            return res.render("dashboard/notifications", {
                message: "Title and content are required."
            });
        }

        const newNotification = new Notification({
            title,
            content,
            icon: icon || "fas fa-info-circle",
            type: type || "info",
            expiresAt: expiresAt || null
        });

        try {
            await newNotification.save();
            res.redirect("/dashboard/notifications");
        } catch (error) {
            console.error('Error adding notification:', error);
            res.redirect("/dashboard/notifications");
        }
    });

app.get("/dashboard/notifications/toggle/:id", async (req, res) => {
    if (!req.isAuthenticated() || !config.client.owners.includes(req.user.id)) {
        return res.redirect("/dashboard/notifications");
    }

    const notification = await Notification.findById(req.params.id);
    if (notification) {
        notification.isActive = !notification.isActive;
        await notification.save();
    }
    
    res.redirect("/dashboard/notifications");
});

app.get("/dashboard/notifications/delete/:id", async (req, res) => {
    if (!req.isAuthenticated() || !config.client.owners.includes(req.user.id)) {
        return res.redirect("/dashboard/notifications");
    }

    await Notification.findByIdAndDelete(req.params.id);
    res.redirect("/dashboard/notifications");
});

module.exports = app;