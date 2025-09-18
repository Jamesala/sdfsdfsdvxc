const app = require("express").Router();

console.success("[Dashbord] / router loaded.".brightYellow);

app.get("/dashboard/bots", async (req, res) => {
    if (!req.isAuthenticated()) return res.render("404", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: "Musisz być zalogowany, aby zobaczyć tę stronę."
    });

    if (!config.client.owners.includes(req.user.id) && !global.client.guilds.cache.get(config.server.id).members.cache.get(req.user.id).roles.cache.has(config.server.roles.botReviewer)) return res.render("404", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: "Nie masz dostępu do tej strony."
    });

    let bots = await botsdata.find();
    let developers = [];
    await Promise.all(bots.map(async bot => {
        let user = await client.users.fetch(bot.ownerID);
        if (user) {
            if (developers.includes(user.id)) return;
            developers.push(user);
        }
        for (const coowner of bot.coowners) {
            let coUser = await client.users.fetch(coowner);
            if (coUser) {
                if (developers.includes(coUser.id)) return;
                developers.push(coUser);
            }
        }
    })).catch(() => null)

    res.render("dashboard/bots", {
        bot: await global.client ? global.client : null,
        server: await global.serverClient ? global.serverClient : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        botsdata: await global.botsdata.find(),
        serversdata: await global.serversdata.find(),
        developers: developers.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i)
    });
});

app.post("/dashboard/bot/approve", async (req, res) => {
    if (!req.user) return error(res, "Musisz być zalogowany, aby zobaczyć tę stronę.");
    if (!config.client.owners.includes(req.user.id) &&
        !global.client.guilds.cache.get(config.server.id).members.cache.get(req.user.id).roles.cache.has(config.server.roles.botReviewer))
        return error(res, "Nie masz uprawnień do zatwierdzania botów.");

    if (!global.client.guilds.cache.get(config.server.id).members.cache.get(req.body.botID)) return error(res, "Bot, którego próbujesz zatwierdzić, nie znajduje się na głównym serwerze. Zaproś bota, klikając <a href='https://discord.com/oauth2/authorize?client_id=" + req.body.botID + "&scope=bot&permissions=0' target='_blank'>link z zaproszeniem (0 Uprawnienien ze względów bezpieczeństwa)</a> i spróbuj ponownie.");
    let {
        botID
    } = req.body;

    let botdata = await botsdata.findOne({
        botID: botID
    });

    if (!botdata) return error(res, "Bot, którego próbujesz zatwierdzić, nie istnieje.");
    if (botdata.status == "Approved") return error(res, "Nie możesz zatwierdzić bota, który jest już zatwierdzony.");

    res.json({
        success: true,
        message: `Zatwierdzono pomyślnie ${botdata.username} bota.`,
    });

    global.client.channels.cache.get(config.server.channels.botlogs).send(`${global.config.server.emojis.approve ?? "✅"} | <@${botID}> od <@${botdata.ownerID}>${botdata.coowners?.length ? `, ${botdata.coowners.map(u => `<@${u}>`).join(', ')}` : ''} został zatwierdzony przez <@${req.user.id}>.\n<${global.config.website.url}/bot/${botID}>`);
    await botsdata.findOneAndUpdate({
        botID: botID
    }, {
        $set: {
            status: "Approved"
        },
    });
});

app.post("/dashboard/bot/decline", async (req, res) => {
    if (!req.user) return error(res, "Musisz być zalogowany, aby zobaczyć tę stronę.");
    if (!config.client.owners.includes(req.user.id) &&
        !global.client.guilds.cache.get(config.server.id).members.cache.get(req.user.id).roles.cache.has(config.server.roles.botReviewer))
        return error(res, "Nie masz uprawnień do odrzucania botów.");
    let {
        botID,
        reason
    } = req.body;

    let botdata = await botsdata.findOne({
        botID: botID
    });

    reason.trim();
    if (!reason) return error(res, "Musisz podać powód odrzucenia tego bota.");
    if (reason.length < 10) return error(res, "Powód musi mieć co najmniej 10 znaków, aby można było podać powód.");

    if (!botdata) return res.redirect("/dashboard/bots");
    if (botdata.status !== "unverified") return error(res, "Nie możesz odrzucić bota, który nie jest niezweryfikowany.");

    res.json({
        success: true,
        message: `Pomyślnie odrzuciłeś ${botdata.username} bota.`,
    });

    global.client.users.fetch(botID).then(bota => {
        global.client.channels.cache.get(config.server.channels.botlogs).send(`${global.config.server.emojis.decline ?? "❌"} <@${botdata.ownerID}>${botdata.coowners?.length ? `, ${botdata.coowners.map(u => `<@${u}>`).join(', ')}` : ''} bot o nazwie <@${botID}> został odrzucony przez <@${req.user.id}>.\n**Powód:** ${reason}`);
    });

    await botsdata.findOneAndDelete({
        botID: botID
    });
});

module.exports = app;