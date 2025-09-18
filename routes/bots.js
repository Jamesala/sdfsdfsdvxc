const app = require('express').Router();
console.success('[Bots] /bots router loaded.'.bgYellow.black);

app.get('/bots', async (req, res) => {
    let bots = await botsdata.find();
    let tags = {};
    let total_tags = config.website.botTags;
    for (let bot of bots.filter(b => b.tags?.length))
        for (let tag of bot.tags) tags[tag] = (tags[tag] || 0) + 1;
    let tag_count = [];
    for (let tag of total_tags) {
        if (tags[tag]) {
            tag_count.push({
                tag: tag,
                count: tags[tag]
            });
        } else {
            tag_count.push({
                tag: tag,
                count: 0
            });
        }
    }

    res.render('bots', {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        bots: bots,
        tags: tag_count.sort((a, b) => b.count - a.count),
    });
});

app.get('/discord', (req, res) => {
    if (!global.config.website.support) return res.render("404.ejs", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: "Aby edytować bota, musisz się zalogować."
    });

    res.redirect(global.config.website.support);
});

app.get('/tos', (req, res) => {
    res.render('more/tos', {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
    });
});

app.get('/privacy', (req, res) => {
    res.render('more/privacy', {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
    });
});

module.exports = app;