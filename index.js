console.clear();
require("cute-logs");
const url = require("url");
const ejs = require("ejs");
const path = require("path");
const express = require('express');
const session = require("express-session");
const MongoDBStore = require("connect-mongodb-session")(session);
const app = express();
const fetch = require("node-fetch");
const { WebhookClient } = require('discord.js');
const config = require('./config.js');
const commandHandler = require('./discord/serverlist/handlers/commandHandler');
const slashHandler = require('./discord/serverlist/handlers/slashHandler');
const https = require('https');
const checkIfBlocked = require('./middleware/blockedUsers');
const fs = require("fs");
// GLOBALNA BAZA DANYCH
const botsdata = require("./database/models/bots/bots.js");
global.botsdata = botsdata;
const botVotes = require("./database/models/bots/vote.js");
global.botVotes = botVotes;

const ReminderSystem = require('./utils/reminderSystem');

// Uruchom system przypomnień
global.reminderSystem = new ReminderSystem(global.serverClient);
global.reminderSystem.start();

const serversdata = require("./database/models/servers/server.js");
global.serversdata = serversdata;
const serverVotes = require("./database/models/servers/vote.js");
global.serverVotes = serverVotes;

const schedules = require("./database/models/bots/schedules.js");
global.schedules = schedules;

const siteanalytics = require("./database/site-analytics.js");
global.siteanalytics = siteanalytics;

const ratelimitMap = new Map();
global.ratelimitMap = ratelimitMap;

const notificationsRouter = require('./routes/dashboard/notifications');
const notificationsApiRouter = require('./routes/api/notifications');

app.use("/dashboard/notifications", notificationsRouter);
app.use("/api/notifications", notificationsApiRouter);
app.use("/api", require("./routes/api/random-server.js"));
const Ticket = require("./database/models/tickets/ticket");
global.Ticket = Ticket;

const refRouter = require('./routes/ref');
const UserProfile = require('./database/models/profile.js');
app.use('/ref', refRouter);

const sitemapRouter = require('./routes/sitemap');
app.use('/', sitemapRouter);

const mongoSanitize = require("express-mongo-sanitize");
app.use(mongoSanitize());

const xss = require("xss-clean");
app.use(xss());

const compression = require("compression");
app.use(compression());

app.get('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, '/views/assets/robots.txt'));
});

const Redis = require("ioredis");
const redis = new Redis({
    // Add configuration if needed, e.g.:
    // host: 'your-redis-host',
    // port: 6379,
    // password: 'your-redis-password'
}); // Initialize Redis client with optional config
global.redis = redis;
// Combine serversdata.watch() for logging and cache invalidation
serversdata.watch().on("change", async (data) => {
    const serverID = data.documentKey._id;
    const cacheKey = `server_info:${serverID}`;

    // Log change to Discord
    global.client.channels.cache.get(config.server.channels.database.logs).send({
        content: `**Zmieniono dane serwera** [${data.operationType} - ${serverID}]`,
        files: [{
            attachment: Buffer.from(JSON.stringify(data.fullDocument ? data.fullDocument : data, null, 4)),
            name: "data.json"
        }]
    });

    // Invalidate or update cache
    try {
        if (data.operationType === "delete") {
            await redis.del(cacheKey);
            console.log(`Cache deleted for server ${serverID}`);
        } else if (data.operationType === "update" || data.operationType === "insert") {
            const server = data.fullDocument || (await serversdata.findOne({ serverID }));
            if (server && global.client) {
                const guild = global.client.guilds.cache.get(serverID);
                const cacheData = {
                    memberCount: guild ? guild.memberCount : null,
                    icon: guild ? guild.iconURL({ format: 'webp', size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png' : null,
                    name: server.name || null,
                };
                await redis.set(cacheKey, JSON.stringify(cacheData), 'EX', 600); // Cache for 10 minutes
                console.log(`Cache updated for server ${serverID}`);
            }
        }
    } catch (err) {
        console.error(`Error updating cache for server ${serverID}:`, err);
    }
});


//Zabezpieczenia
app.set('view cache', false);

// Periodic cache refresh for active servers
async function refreshServerCache() {
    try {
        const activeServers = await serversdata.find({ votes: { $gte: 5 } }).limit(100); // Adjust criteria as needed
        for (const server of activeServers) {
            const cacheKey = `server_info:${server.serverID}`;
            if (global.client) {
                const guild = global.client.guilds.cache.get(server.serverID);
                const cacheData = {
                    memberCount: guild ? guild.memberCount : null,
                    icon: guild ? guild.iconURL({ format: 'webp', size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png' : null,
                    name: server.name || null,
                };
                await redis.set(cacheKey, JSON.stringify(cacheData), 'EX', 600);
                console.log(`Cache refreshed for server ${server.serverID}`);
            }
        }
        console.log(`Refreshed cache for ${activeServers.length} servers`);
    } catch (err) {
        console.error('Error refreshing server cache:', err);
    }
}

// Run every hour
setInterval(refreshServerCache, 60 * 60 * 1000);
refreshServerCache(); // Run immediately on startup

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

const options = {
    key: fs.readFileSync("key.pem"),
    cert: fs.readFileSync("cert.pem")
};

const httpsServer = https.createServer(options, app);
httpsServer.listen(443, () => {
    console.success(`[Strona] HTTPS działa pod: ${config.website.url}`);
});

app.use((req, res, next) => {
  if (!req.secure && req.get('X-Forwarded-Proto') !== 'https' && process.env.NODE_ENV === "production") {
    return res.redirect(301, `https://${req.hostname}${req.url}`);
  }
  next();
});

app.use((req, res, next) => {
  if (req.hostname.startsWith('www.')) {
    return res.redirect(301, `https://${req.hostname.replace('www.', '')}${req.url}`);
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.post('/csp-violation-report-endpoint', (req, res) => {
  if (req.body) {
    console.log('CSP Violation:', req.body);
  }
  res.status(204).end();
});


const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", "https://discordzik.pl"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'", // Needed for some scripts
        "https://cdn.discordapp.com",
		"https://crypto-orbit.com",
		"https://webpulser.site",
		"https://cdn-cookieyes.com",
        "https://discordzik.pl",
        "https://*.discordzik.pl",
        "https://code.jquery.com",
        "https://cdnjs.cloudflare.com",
        "https://ajax.googleapis.com",
		"https://googleads.g.doubleclick.net",
		"https://googleads.g.doubleclick.net",
		"https://www.googleadservices.com",
        "https://static.cloudflareinsights.com",
        "https://cdn.jsdelivr.net",
        "https://www.googletagmanager.com",
        "https://www.google-analytics.com",
        "https://pagead2.googlesyndication.com",
        "https://kit.fontawesome.com",
        "https://unpkg.com",
        "https://cdn.iubenda.com",
        "https://cs.iubenda.com",
        "https://fundingchoicesmessages.google.com", // Added for Google funding choices
        "https://images.dmca.com",
        "https://idb.iubenda.com"
      ],
scriptSrcElem: [
  "'self'",
  "'unsafe-inline'",
  "https://cdn.discordapp.com",
  "https://discordzik.pl",
  "https://analytics.ahrefs.com",
  "https://crypto-orbit.com",
  "https://cdn-cookieyes.com",
  "https://webpulser.site",
  "https://*.discordzik.pl",
  "https://code.jquery.com",
  "https://cdnjs.cloudflare.com",
  "https://ajax.googleapis.com",
  "https://googleads.g.doubleclick.net",
  "https://www.googleadservices.com",
  "https://static.cloudflareinsights.com",
  "https://cdn.jsdelivr.net",
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
  "https://pagead2.googlesyndication.com",
  "https://kit.fontawesome.com",
  "https://unpkg.com",
  "https://cdn.iubenda.com",
  "https://cs.iubenda.com",
  "https://fundingchoicesmessages.google.com",
  "https://images.dmca.com",
  "https://idb.iubenda.com",
  "https://animatedicons.co"
],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.discordapp.com",
        "https://discordzik.pl",
		"https://webpulser.site",
        "https://*.discordzik.pl",
		"https://cdn-cookieyes.com",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
        "https://kit.fontawesome.com",
        "https://unpkg.com",
        "https://fonts.googleapis.com",
        "https://cdn.iubenda.com",
        "https://cs.iubenda.com"
      ],
      imgSrc: ["*", "data:", "blob:"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'"],
      connectSrc: [
        "'self'",
        "https://discord.com",
        "https://discordapp.com",
		"https://cdn-cookieyes.com",
		"https://log.cookieyes.com",
		"https://cpl.iubenda.com",
		"https://webpulser.site",
		"https://pagead2.googlesyndication.com",
        "https://discordzik.pl",
        "https://*.discordzik.pl",
        "https://www.google-analytics.com",
        "https://*.google-analytics.com",
        "https://region1.google-analytics.com",
        "https://stats.g.doubleclick.net",
        "https://static.cloudflareinsights.com",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://cs.iubenda.com",
        "https://idb.iubenda.com",
        "https://cdn.iubenda.com",
        "https://images.dmca.com",
        "https://www.google.com",
        "https://www.googletagmanager.com",
        "https://fundingchoicesmessages.google.com",
		"https://animatedicons.co",
		"https://analytics.ahrefs.com"
      ],
      fontSrc: [
        "'self'",
        "data:",
        "https://discordzik.pl",
        "https://*.discordzik.pl",
        "https://cdnjs.cloudflare.com",
		"https://cdn-cookieyes.com",
        "https://fonts.gstatic.com",
        "https://static.cloudflareinsights.com",
        "https://kit.fontawesome.com",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://cdn.iubenda.com"
      ],
      frameSrc: [
        "'self'",
        "https://discord.com",
        "https://discordapp.com",
        "https://www.google.com",
		"https://td.doubleclick.net",
        "https://pagead2.googlesyndication.com",
        "https://unpkg.com",
        "https://*.iubenda.com",
        "https://static.cloudflareinsights.com",
        "https://www.googletagmanager.com",
		"https://cdn-cookieyes.com",
        "https://fundingchoicesmessages.google.com",
		"https://googleads.g.doubleclick.net"
      ],
      mediaSrc: [
        "'self'",
        "https://discordzik.pl",
        "https://*.discordzik.pl",
		"https://cdn-cookieyes.com",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://cdn.iubenda.com",
        "https://fonts.gstatic.com"
      ],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      formAction: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: "'self'",
      upgradeInsecureRequests: []
    },
    reportOnly: false
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-site" },
  originAgentCluster: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  strictTransportSecurity: {
    maxAge: 15552000,
    includeSubDomains: true,
    preload: true
  },
  xssFilter: true,
  noSniff: true,
  ieNoOpen: true,
  reportUri: "/csp-violation-report-endpoint",
  frameguard: { action: "deny" }
}));

app.get("/ads.txt", (req, res) => {
    res.sendFile(path.join(__dirname, "/views/assets/ads.txt"));
});

botsdata.watch().on("change", data => {
    global.client.channels.cache.get(config.server.channels.database.logs).send({
        content: `**Zmieniono dane bota** [${data.operationType} - ${data.documentKey._id}]`,
        files: [{
            attachment: Buffer.from(JSON.stringify(data.fullDocument ? data.fullDocument : data, null, 4)),
            name: "data.json"
        }]
    })
});


function error(res, message = 'Złe żądanie', _code = 400) {
    res.json({ error: true, message })
};
global.error = error;

global.resolveAvatarURL = async function resolveAvatarURL(user) {
    if (!user || !user.id) return client.rest.cdn.defaultAvatar(0);

    let fetchedUser = client.users.cache.get(user.id) || await client.users.fetch(user.id).catch(() => null);
    
    return fetchedUser && fetchedUser.avatar 
        ? `https://cdn.discordapp.com/avatars/${fetchedUser.id}/${fetchedUser.avatar}.png`
        : client.rest.cdn.defaultAvatar(user.discriminator % 5);
};


global.executeVoteWebhook = async function executeVoteWebhook(user, botdata) {
    if (!user || !botdata || !botdata.webhookURL) return false;
    
    // Sprawdź czy webhookURL jest prawidłowym URL-em
    try {
        new URL(botdata.webhookURL);
    } catch {
        return false;
    }

    let bot;
    try {
        bot = global.client.users.cache.get(botdata.botID) ?? await global.client.users.fetch(botdata.botID);
        if (!bot) return false;
    } catch {
        return false;
    }

    try {
        const webhookClient = new WebhookClient({ url: botdata.webhookURL });
        
        const embed = {
            author: {
                name: bot.tag,
                icon_url: await resolveAvatarURL(bot)
            },
            title: ' | Głos oddany na bota',
            url: `${global.config.website.url}/bot/${bot.id}`,
            fields: [{
                name: 'Użytkownik',
                value: `${user.username} - ${user.id}`
            }, {
                name: 'Bot',
                value: `${bot.tag} - ${bot.id}`
            }, {
                name: 'Liczba głosów',
                value: botdata.votes.toLocaleString()
            }],
            footer: {
                text: `Zagłosował ${user.username}`,
                icon_url: await resolveAvatarURL(user)
            },
            timestamp: new Date(),
            color: Math.trunc(Math.random() * 0xffffff)
        };

        await webhookClient.send({
            embeds: [embed],
            username: client.user.username,
            avatarURL: client.user.displayAvatarURL()
        });

        webhookClient.destroy();
        return true;
    } catch (error) {
        console.error("Błąd podczas wykonywania webhooka głosowania:", error);
        
        if (error.code === 10015 || error.message.includes("Unknown Webhook")) {
            try {
                await botsdata.findOneAndUpdate({ botID: bot.id }, { $unset: { webhookURL: "" } });
                global.client.channels.cache.get(global.config.server.channels.botlogs).send({
                    content: `<@${botdata.ownerID}>${botdata.coowners?.length ? `, ${botdata.coowners.map(u => `<@${u}>`).join(', ')}` : ''}, <@${botdata.botID}>'s webhookURL do głosowania został usunięty.\nPowód: [Auto] WebhookURL dla systemu głosowania wydaje się być niedostępny.`,
                    allowedMentions: { users: [botdata.ownerID].concat(botdata.coowners || []), roles: [] }
                });
            } catch (dbError) {
                console.error("Błąd podczas usuwania webhookURL:", dbError);
            }
        }
        return false;
    }
}

module.exports = async (client) => {
    const store = new MongoDBStore({
        uri: global.config.database.url,
        collection: 'sessions',
        // Opcjonalne dodatkowe opcje:
        connectionOptions: {
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
	
try {
        await serversdata.createIndex({ serverID: 1 });
        console.log('MongoDB index created for serverID');
    } catch (err) {
        console.error('Error creating MongoDB index:', err);
    }
    // Obsługa błędów połączenia
    store.on('error', function(error) {
        console.error('[SESSION STORE ERROR]', error);
    });

app.use(session({
    secret: process.env.SESSION_SECRET,
    store: store,
    cookie: {
        maxAge: 2160000000,
        secure: true,
        httpOnly: true,
        sameSite: 'none', // Zmień z 'lax' na 'none'
        domain: '.discordzik.pl' // Upewnij się, że to jest prawidłowa domena
    },
    resave: false,
    saveUninitialized: false
}));

    const templateDir = path.resolve(`${process.cwd()}${path.sep}/views`);
    app.get("/arc-sw.js", (req, res) => {
        res.sendFile(path.join(__dirname, "/views/assets/js/arc-sw.js"));
    });
    app.use('/assets', express.static(path.resolve(`${templateDir}${path.sep}/assets`)));

    var minify = require('express-minify');
    app.use(minify({
        cache: path.resolve(`${templateDir}${path.sep}/assets`)
    }));

    // ===== PASSPORT ===== //
    const passport = require("passport");
    const DiscordStrategy = require('passport-discord').Strategy;
    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((obj, done) => done(null, obj));
    passport.use(new DiscordStrategy({
        clientID: config.client.id,
        clientSecret: config.client.secret,
        callbackURL: config.website.callback,
        scope: ['identify', 'guilds']
    }, (_accessToken, _refreshToken, profile, done) => {
        process.nextTick(() => done(null, profile));
    }));

    app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
    app.use(passport.initialize());
    app.use(passport.session());


    app.engine("ejs", ejs.renderFile);
    app.set("view engine", "ejs");

    app.get("/login", (req, _res, next) => {
        if (req.session.backURL) {
            req.session.backURL = req.session.backURL;
        } else if (req.headers.referer) {
            const parsed = url.parse(req.headers.referer);
            if (parsed.hostname === app.locals.domain) {
                req.session.backURL = parsed.path;
            }
        } else {
            req.session.backURL = "/";
        }
        next();
    }, passport.authenticate("discord"));

    app.get("/callback", passport.authenticate("discord", {
        failureRedirect: "/"
    }), async (req, res) => {
        try {
            fetch(`https://discordapp.com/api/v8/guilds/${config.server.id}/members/${req.user.id}`, {
                method: "PUT",
                headers: {
                    "Authorization": `Bot ${config.client.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    access_token: req.user.accessToken
                })
            });
        } catch (e) {
            console.log(e);
        }
req.session.save(() => {
    if (req.session.backURL) {
        const url = req.session.backURL;
        req.session.backURL = null;
        res.redirect(url);
    } else {
        res.redirect("/");
    }
});

        let countryMessage;
        try {
            var getIP = require('ipware')()?.get_ip;
            var ipInfo = getIP(req);
            var geoip = require('geoip-lite');
            var ip = ipInfo.clientIp;
            var geo = geoip.lookup(ip);
            const lookup = require('country-code-lookup')
            let countryCode = lookup?.byIso(geo.country) ?? null
            let countryName = countryCode.country
            countryMessage = `:flag_${geo.country.toLowerCase()}: (${geo.country}) ${countryName}`
        } catch (e) {
            countryMessage = "Nieznane"
        }

        const embed = {
            author: {
                name: `${req.user.username}`,
                icon_url: `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`
            },
            description: `[${req.user.username}](${global.config.website.url}/profile/${req.user.id}) zalogował się z ${countryMessage}`,
            color: 0x00FF00
        };

        client.channels.cache.get(config.server.channels.login).send({
            embeds: [embed],
            allowedMentions: { parse: ['users', 'roles'] }
        });
    });

    app.get("/logout", async (req, res) => {
        try {
            if (!req.user) return res.redirect("/");
            const embed = {};
            embed.author = {
                name: `${req.user.username}`,
                icon_url: `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`
            };
            embed.description = `[${req.user.username}](${global.config.website.url}/profile/${req.user.id}) wylogował się.`;
            embed.color = 0xFF0000;
            client.channels.cache.get(config.server.channels.login).send({
                embeds: [embed],
                allowedMentions: { parse: ['users', 'roles'] }
            });
            req.logout(function (err) {
                if (err) { return next(err); }
                res.redirect('/');
            });
        } catch (e) {
            res.status(500).render("404", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                message: "Wygląda na to, że wystąpił błąd. Spróbuj ponownie później. Jeśli problem będzie się powtarzał, skontaktuj się z zespołem pomocy technicznej."
            })
            console.log(e);
        }
    });

// ====== PROMOWANE SERWERY ====== //
global.promotedServersCache = {
    data: null,
    lastUpdated: 0,
    updateInProgress: false
};

const PROMOTED_CACHE_TTL = 30000; // Cache ważny przez 30 sekund

// Funkcja aktualizująca cache dla promowanych serwerów
async function updatePromotedServersCache() {
    if (global.promotedServersCache.updateInProgress) return;
    global.promotedServersCache.updateInProgress = true;

    try {
        const now = new Date();
        
        // Pobierz serwery z aktualną promocją
        const promotedServers = await global.serversdata.find({
            status: { $in: ['BASIC', 'GOLD', 'PRO'] },
            promotedUntil: { $gt: now }
        }).sort({ status: -1, promotedUntil: -1 });

        // Mapuj serwery z danymi z Discorda
        const serversWithDetails = await Promise.all(promotedServers.map(async (server) => {
            let name, iconURL, memberCount;

            // Najpierw spróbuj pobrać dane z Discorda
            let discordServer;
            try {
                discordServer = await global.serverClient?.guilds.fetch(server.serverID);
                if (!discordServer) {
                    console.warn(`Server ${server.serverID} not found in Discord cache. Using database fallback.  Is the bot still a member of this server?`);
                }
            } catch (error) {
                console.error(`Error fetching Discord server ${server.serverID}:`, error);
            }

            // Użyj danych z Discorda, jeśli dostępne, w przeciwnym razie z bazy danych
            name = discordServer?.name || server.name || 'Nieznany';
            iconURL = discordServer?.iconURL({ format: 'webp', size: 256, dynamic: true }) || server.icon || 'https://cdn.discordapp.com/embed/avatars/0.png';
            memberCount = discordServer?.memberCount || server.memberCount || 0;

            // Jeśli nazwa z Discorda jest dostępna, aktualizuj bazę danych
            if (discordServer?.name && (!server.name || server.name !== discordServer.name)) {
                try {
                    await global.serversdata.updateOne(
                        { serverID: server.serverID },
                        { $set: { name: discordServer.name, icon: discordServer.icon } }
                    );
                    console.log(`Updated server name in database for serverID: ${server.serverID} to ${discordServer.name}`);
                } catch (updateError) {
                    console.error(`Error updating server name in database for serverID: ${server.serverID}:`, updateError);
                }
            }

            // Logowanie dla debugowania
            if (name === 'Nieznany') {
                console.warn(`Server ${server.serverID} has no name. Server data:`, JSON.stringify(server, null, 2));
            }

            return {
                serverID: server.serverID,
                name: name,
                iconURL: iconURL,
                memberCount: memberCount,
                shortDesc: server.shortDesc || 'Brak opisu',
                tags: server.tags || ['Community'],
                status: server.status,
                votes: server.votes || 0,
                promotedUntil: server.promotedUntil
            };
        }));

        global.promotedServersCache.data = serversWithDetails;
        global.promotedServersCache.lastUpdated = Date.now();
        console.log(`Promoted servers cache updated at ${new Date().toISOString()} with ${serversWithDetails.length} servers`);
    } catch (error) {
        console.error('Error updating promoted servers cache:', error);
        if (!global.promotedServersCache.data) {
            global.promotedServersCache.data = [];
        }
    } finally {
        global.promotedServersCache.updateInProgress = false;
    }
}

// Inicjalizacja cache przy starcie i regularne aktualizacje
updatePromotedServersCache(); // Uruchom od razu przy starcie
setInterval(updatePromotedServersCache, PROMOTED_CACHE_TTL);
updatePromotedServersCache(); // Uruchom od razu przy starcie

// Endpoint API dla promowanych serwerów
app.get('/api/promoted-servers', async (req, res) => {
    try {
        // Jeśli cache jest pusty lub nieaktualny, odśwież go
        if (!promotedServersCache.data || Date.now() - promotedServersCache.lastUpdated > PROMOTED_CACHE_TTL) {
            if (!promotedServersCache.updateInProgress) {
                await updatePromotedServersCache();
            } else {
                // Czekaj na zakończenie aktualizacji cache
                await new Promise(resolve => {
                    const checkCache = () => {
                        if (!promotedServersCache.updateInProgress) {
                            resolve();
                        } else {
                            setTimeout(checkCache, 100);
                        }
                    };
                    checkCache();
                });
            }
        }

        res.json(promotedServersCache.data);
    } catch (error) {
        console.error('Error fetching promoted servers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

    // Middleware blokujący użytkowników - wykluczamy trasę /blocked aby uniknąć pętli
    app.use((req, res, next) => {
        if (req.path === '/blocked') {
            return next(); // Nie sprawdzaj czy użytkownik jest zbanowany na stronie blocked
        }
        checkIfBlocked(req, res, next);
    });

    // ====== ROUTES ====== //
    const fs = require("fs");
    require("colors");
    console.log("===============================".white);
    console.log("       Ładowanie tras...".red);
    // dla każdej kategorii dodaj loga z "================="
    fs.readdirSync('./routes').forEach(async file => {
        console.log("===============================".white);
        if (fs.lstatSync(`./routes/${file}`).isDirectory()) {
            console.success(`Ładowanie tras ${file}...`.white);
            fs.readdirSync(`./routes/${file}`).forEach(file2 => {
                const route = require(`./routes/${file}/${file2}`);
                app.use(route);
            });
        } else {
            const route = require(`./routes/${file}`);
            app.use(route);
        }
    });

    app.use(async (req, res, next) => {
        var getIP = require('ipware')().get_ip;
        var ipInfo = getIP(req);
        var geoip = require('geoip-lite');
        var ip = ipInfo.clientIp;
        var geo = geoip.lookup(ip);
        if (geo) {
            let analytics = siteanalytics.find();
            await analytics.updateOne({
                id: global.config.client.id
            }, {
                $inc: {
                    [`country.${geo.country}`]: 1
                }
            }, {
                upsert: true
            })
        }
        return next();
    })

app.get('/webpulser.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/assets/js/webpulser.js'));
});

    app.use(async (err, req, res, next) => {
        if (err) {
            console.log(err);
            return res.status(500).render('404', {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                message: 'Wygląda na to, że wystąpił błąd lub zostałeś zablokowany. Spróbuj ponownie później. Jeśli problem będzie się powtarzać, skontaktuj się z zespołem pomocy technicznej.'
            })
        }
        return next();
    });

    app.get('*', function (req, res) {
        return res.status(404).render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Wygląda na to, że strona, której szukasz, została pożarta przez dzika."
        })
    });

    console.log("===============================".white);
    const checkers = require("fs").readdirSync("./checkers").filter(file => file.endsWith(".js"));
    for (const file of checkers) {
        require(`./checkers/${file}`);
    }
}

