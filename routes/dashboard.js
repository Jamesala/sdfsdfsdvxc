const app = require("express").Router();

console.success("[Dashbord] / router loaded.".bgYellow.black);

app.get("/dashboard", async (req, res) => {
    if (!req.isAuthenticated()) return res.render("404", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: "You need to be logged in to view this page."
    });

    if (!global.config.client.owners.includes(req.user.id) && !global.members.cache.get(req.user.id)?.roles.cache.has(global.config.server.roles.botReviewer)) return res.render("404", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: "You cannot access this page."
    });

    res.render("dashboard/index", {
        bot: global.client ? global.client : null,
        server: global.serverClient ? global.serverClient : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req
    });
});

app.use("/", require("./dashboard/index"));
app.use("/", require("./dashboard/bots"));
app.use("/", require("./dashboard/servers"));
app.use("/", require("./dashboard/promote"));
app.use("/", require("./dashboard/comments"));
app.use("/", require("./dashboard/notifications"));
app.use("/", require("./dashboard/shop"));
app.use("/", require("./dashboard/tickets"));
app.use("/", require("./dashboard/bans"));
app.use("/", require("./dashboard/referral"));
app.use("/", require("./dashboard/badges"));

module.exports = app;