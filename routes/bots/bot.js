const app = require('express').Router();
const moment = require('moment');
const botsdata = require("../../database/models/bots/bots.js");
const fetch = require('node-fetch');
const cache = require('memory-cache');
const config = require('../../config.js');

console.success('[Bots] /bots/bot.js router loaded.'.brightYellow);


async function shouldCountView(botId) {
    const key = `bot_views:${botId}`;
    
    // Zwiększamy licznik i pobieramy aktualną wartość
    const currentCount = await redis.incr(key);
    
    // Jeśli to pierwsze zwiększenie, ustawiamy czas wygaśnięcia
    if (currentCount === 1) {
        await redis.expire(key, 3600); // 1 godzina
    }
    
    // Zwracamy true tylko jeśli nie przekroczono limitu
    return currentCount <= 50;
}



// Cache configuration
const pawelbApiCache = {
    data: new Map(),
    ttl: 5 * 24 * 60 * 60 * 1000, // 5 days in milliseconds
    lastCleaned: Date.now(),
    cleanInterval: 24 * 60 * 60 * 1000, // Clean every 24 hours
};

// Function to clean old cache entries
function cleanCache(cacheConfig) {
    const now = Date.now();
    for (const [key, value] of cacheConfig.data.entries()) {
        if (now - value.timestamp > cacheConfig.ttl) {
            cacheConfig.data.delete(key);
        }
    }
    cacheConfig.lastCleaned = now;
}

// Function to get server count with caching and timeout
async function getCachedServerCount(botId) {
    if (Date.now() - pawelbApiCache.lastCleaned > pawelbApiCache.cleanInterval) {
        cleanCache(pawelbApiCache);
    }

    const cached = pawelbApiCache.data.get(botId);
    if (cached && (Date.now() - cached.timestamp < pawelbApiCache.ttl)) {
        return { serverCount: cached.serverCount, fromCache: true };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
        const response = await fetch('https://api.pawelb.link/api/bot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bot_id: botId }),
            signal: controller.signal
        });
        
        if (!response.ok) {
            throw new Error(`API responded with status ${response.status}`);
        }
        
        const apiData = await response.json();
        const serverCount = apiData.approximate_guild_count || 0;
        
        pawelbApiCache.data.set(botId, { serverCount, timestamp: Date.now() });
        return { serverCount, fromCache: false };
    } catch (e) {
        console.error(`Error fetching server count for bot ${botId}:`, e.message);
        return { serverCount: cached ? cached.serverCount : 0, fromCache: true };
    } finally {
        clearTimeout(timeout);
    }
}

app.get('/bot/:id', async (req, res) => {
    try {
        // First check if this is a vanity URL request
        if (req.params.id.match(/^[a-zA-Z0-9\-]+$/) && !req.params.id.match(/^\d+$/)) {
            const botWithVanity = await botsdata.findOne({ vanityURL: req.params.id });
            if (botWithVanity) {
                return res.redirect(`/bot/${botWithVanity.botID}`);
            }
        }
		
		// Sprawdzenie czy można doliczyć wyświetlenie
        if (await shouldCountView(req.params.id)) {
            await botsdata.updateOne(
                { botID: req.params.id },
                { $inc: { 'analytics.views': 1 } }
            );
        }

        // Check page cache first
        const cachedPage = cache.get(`botpage:${req.params.id}`);
        if (cachedPage) {
            return res.send(cachedPage);
        }

        // Execute database queries in parallel
        const [botdata, allBotsData] = await Promise.all([
            botsdata.findOne({ botID: req.params.id }),
            botsdata.find().catch(() => []) // Fallback empty array if error
        ]);

        if (!botdata) {
            // Check if this might be a vanity URL that wasn't caught earlier
            if (req.params.id.match(/^[a-zA-Z0-9\-]+$/)) {
                const botWithVanity = await botsdata.findOne({ vanityURL: req.params.id });
                if (botWithVanity) {
                    return res.redirect(`/bot/${botWithVanity.botID}`);
                }
            }
            
            return res.render("404.ejs", {
                bot: global.client || null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                message: "Wygląda na to, że bot którego szukasz, został pożarty przez dzika."
            });
        }

        // Get server count (with caching)
        const { serverCount, fromCache } = await getCachedServerCount(req.params.id);

        // Prepare user fetch promises
        const fetchPromises = [
            client.users.fetch(botdata.ownerID).catch(() => ({
                id: botdata.ownerID,
                username: "Unknown",
                discriminator: "0000",
                avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
            }))
        ];

        // Add coowners if they exist
        if (botdata.coowners && botdata.coowners.length > 0) {
            fetchPromises.push(
                ...botdata.coowners.map(id => 
                    client.users.fetch(id).catch(() => null)
                )
            );
        }

        // Add rate authors if they exist
        if (botdata.rates && botdata.rates.length > 0) {
            fetchPromises.push(
                ...botdata.rates.map(rate => 
                    client.users.fetch(rate.author).catch(() => ({
                        id: rate.author,
                        username: "Unknown",
                        discriminator: "0000",
                        avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
                    }))
                )
            );
        }

        const fetchedUsers = await Promise.all(fetchPromises);
        
        // Process fetched users
        const owner = fetchedUsers[0];
        const coowners = (botdata.coowners && botdata.coowners.length > 0) 
            ? fetchedUsers.slice(1, 1 + botdata.coowners.length).filter(u => u !== null)
            : [];
        
        const rateAuthors = (botdata.rates && botdata.rates.length > 0)
            ? fetchedUsers.slice(1 + (botdata.coowners ? botdata.coowners.length : 0))
            : [];

        // Get support invite if available
        let supdata = "";
        if (botdata.support) {
            try {
                supdata = await client.fetchInvite(botdata.support);
            } catch (e) {
                supdata = "";
            }
        }

        const renderData = {
            bot: global.client || null,
            server: global.serverClient,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            rateAuthors: rateAuthors,
            owner: owner,
            coowners: coowners,
            botdata: botdata,
            supdata: supdata,
            moment: moment,
            botsdata: allBotsData,
            apiServerCount: serverCount,
            isServerCountFromCache: fromCache,
            vanityURL: botdata.vanityURL ? `/bots/${botdata.vanityURL}` : null
        };

        // Render the page
        const renderedPage = await res.render('bots/bot', renderData);
        
        // Cache the rendered page if successful
        cache.put(`botpage:${req.params.id}`, renderedPage, 5 * 60 * 1000); // Cache for 5 minutes
        
        return renderedPage;
    } catch (e) {
        console.error('Error in /bot/:id route:', e.stack);
        return res.render("404.ejs", {
            bot: global.client || null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Wystąpił błąd, spróbuj ponownie później. Administratorzy zostali powiadomieni."
        });
    }
});

// Dodaj nową ścieżkę dla vanity URL
app.get('/bots/:vanity', async (req, res) => {
    try {
        const botdata = await botsdata.findOne({ vanityURL: req.params.vanity });
        if (!botdata) {
            return res.redirect('/bots');
        }
        return res.redirect(`/bot/${botdata.botID}`);
    } catch (e) {
        console.error('Error in vanity URL route:', e);
        return res.redirect('/bots');
    }
});

async function cleanupBotViewsCache() {
    try {
        const keys = await redis.keys('bot_views:*');
        for (const key of keys) {
            await redis.del(key);
        }
    } catch (err) {
        console.error('Error cleaning up bot views cache:', err);
    }
}

setInterval(cleanupBotViewsCache, 24 * 60 * 60 * 1000);
cleanupBotViewsCache(); // Uruchom też przy starcie

module.exports = app;