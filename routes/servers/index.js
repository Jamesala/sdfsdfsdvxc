const app = require('express').Router();

let cachedServersData = null;
let cacheExpiry = null;

app.get('/servers', async (req, res) => {
    // Dane użytkownika zawsze świeże
    const userData = {
        user: req.isAuthenticated() ? req.user : null,
        path: req.path,
        req: req
    };

    // Sprawdź czy cache danych serwerów jest aktualny (1 dzień = 86400000 ms)
    if (cachedServersData && cacheExpiry && Date.now() < cacheExpiry) {
        return res.render('servers', {
            ...cachedServersData,
            ...userData,
            bot: global.client ? global.client : null,
            sbot: global.serverClient
        });
    }

    let servers = await serversdata.find();
    let tags = {};
    let total_tags = config.website.serverTags;
    
    for (let server of servers.filter(b => b.tags?.length)) {
        for (let tag of server.tags) tags[tag] = (tags[tag] || 0) + 1;
    }
    
    let tag_count = [];
    for (let tag of total_tags) {
        tag_count.push({
            tag: tag,
            count: tags[tag] || 0
        });
    }

    // Zapis tylko danych serwerów do cache na 1 dzień
    cachedServersData = {
        servers: servers,
        tags: tag_count.sort((a, b) => b.count - a.count)
    };
    cacheExpiry = Date.now() + 86400000;

    res.render('servers', {
        ...cachedServersData,
        ...userData,
        bot: global.client ? global.client : null,
        sbot: global.serverClient
    });
});

module.exports = app;