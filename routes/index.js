


const app = require('express').Router();
const serverVotes = require('../database/models/serverVotes');
console.log('[Home] /index router loaded.'.bgYellow.black);

// Cache variables
let cache = {
    data: null,
    lastUpdated: 0,
    updateInProgress: false
};

const CACHE_TTL = 30000; // 30 seconds in milliseconds

async function updateCache() {
    if (cache.updateInProgress) return;
    cache.updateInProgress = true;

    try {
        // Fetching bot data
        let bots = await botsdata.find();

        // Fetching server data
        let servers = await serversdata.find();

        // Fetching votes data
        let recentVotes = await serverVotes.find({ Date: { $lte: new Date() } }).sort({ Date: -1 });

        // Mapping votes
        let allVotes = recentVotes.map(vote => ({
            serverID: vote.serverID,
            userID: vote.userID,
            bumpCount: Math.max(vote.bumpCount || 0, 1), // Ensure at least 1
            Date: new Date(vote.Date)
        })).filter(vote => vote.Date instanceof Date && !isNaN(vote.Date));

        // Sorting votes by the most recent
        allVotes.sort((a, b) => b.Date - a.Date);

        // Define the threshold for active servers
        const ACTIVE_SERVER_THRESHOLD = 5;
        const ACTIVE_SERVER_DAYS = 7;
        let currentDate = new Date();

        // Combining server data with vote count and determining activity
        let serversWithVotes = [];
        for (let vote of allVotes) {
            let server = servers.find(s => s.serverID === vote.serverID);
            if (server) {
                let existingServer = serversWithVotes.find(s => s.serverID === server.serverID);
                if (existingServer) {
                    existingServer.votes += vote.bumpCount;
                    existingServer.lastVoteDate = vote.Date > existingServer.lastVoteDate ? vote.Date : existingServer.lastVoteDate;
                } else {
                    serversWithVotes.push({
                        ...server._doc,
                        lastVoteDate: vote.Date,
                        votes: vote.bumpCount
                    });
                }
            }
            if (serversWithVotes.length >= 16) break;
        }

        // Calculate total votes and activity
        for (let server of serversWithVotes) {
            let totalVotes = await serverVotes.aggregate([
                { $match: { serverID: server.serverID, Date: { $lte: new Date() } } },
                { $group: { _id: "$serverID", totalVotes: { $sum: "$bumpCount" } } }
            ]);

            server.votes = totalVotes.length ? totalVotes[0].totalVotes : server.votes;

            let recentVotes = allVotes.filter(vote => 
                vote.serverID === server.serverID && 
                (currentDate - vote.Date) / (1000 * 60 * 60 * 24) <= ACTIVE_SERVER_DAYS
            );
            
            let recentVoteCount = recentVotes.reduce((sum, vote) => sum + vote.bumpCount, 0);

            if (recentVoteCount >= 13) {
                server.activityLevel = 5;
            } else if (recentVoteCount >= 10) {
                server.activityLevel = 4;
            } else if (recentVoteCount >= 7) {
                server.activityLevel = 3;
            } else if (recentVoteCount >= 4) {
                server.activityLevel = 2;
            } else {
                server.activityLevel = 1;
            }

            server.isActive = recentVoteCount >= ACTIVE_SERVER_THRESHOLD;
            
            // Adding flags for badges
            server.isPopular = server.votes >= 50;
            server.isNew = (Date.now() - new Date(server.createdAt || Date.now())) < 7 * 24 * 60 * 60 * 1000;
            server.isHighlyRated = server.rates && server.rates.length > 0 && 
                server.rates.reduce((sum, rate) => sum + parseInt(rate.star_rate), 0) / server.rates.length >= 4;
        }

        // Processing bot tags
        let botTags = {};
        let totalBotTags = config.website.botTags;
        for (let bot of bots.filter(b => b.tags?.length)) {
            for (let tag of bot.tags) {
                botTags[tag] = (botTags[tag] || 0) + 1;
            }
        }

        let botTagCount = [];
        for (let tag of totalBotTags) {
            botTagCount.push({
                tag: tag,
                count: botTags[tag] || 0
            });
        }

        // Processing server tags
        let serverTags = {};
        let totalServerTags = config.website.serverTags;
        for (let server of servers.filter(s => s.tags?.length)) {
            for (let tag of server.tags) {
                serverTags[tag] = (serverTags[tag] || 0) + 1;
            }
        }

        let serverTagCount = [];
        for (let tag of totalServerTags) {
            serverTagCount.push({
                tag: tag,
                count: serverTags[tag] || 0
            });
        }

        // Update cache
        cache.data = {
            bots: bots,
            serversWithVotes: serversWithVotes,
            botTagCount: botTagCount.sort((a, b) => b.count - a.count),
            serverTagCount: serverTagCount.sort((a, b) => b.count - a.count)
        };
        cache.lastUpdated = Date.now();
        console.log(`Cache updated at ${new Date().toISOString()}`); // Log update time
    } catch (error) {
        console.error('Cache update error:', error);
        if (!cache.data) {
            cache.data = { bots: [], serversWithVotes: [], botTagCount: [], serverTagCount: [] };
        }
    } finally {
        cache.updateInProgress = false;
    }
}

// Initial cache update
updateCache();

// Regular cache updates
setInterval(updateCache, CACHE_TTL);


// API endpoint dla promowanych serwerów
app.get('/api/promoted-servers', async (req, res) => {
    try {
        // Jeśli cache jest pusty lub nieaktualny, spróbuj go odświeżyć
        if (!global.promotedServersCache?.data || global.promotedServersCache.data.length === 0) {
            const now = new Date();
            const promotedServers = await global.serversdata.find({
                status: { $in: ['BASIC', 'GOLD', 'PRO'] },
                promotedUntil: { $gt: now }
            }).sort({ status: -1, promotedUntil: -1 }).limit(20);

            const serversWithDetails = await Promise.all(promotedServers.map(async (server) => {
                let name = server.name;
                let iconURL = server.iconURL;
                let memberCount = null;

                try {
                    const discordServer = global.serverClient?.guilds.cache.get(server.serverID);
                    if (discordServer) {
                        name = discordServer.name;
                        iconURL = discordServer.iconURL({ format: 'webp', size: 256, dynamic: true }) || server.iconURL;
                        memberCount = discordServer.memberCount;
                    }
                } catch (error) {
                    console.error(`Error fetching Discord data for server ${server.serverID}:`, error);
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

            return res.json(serversWithDetails);
        }

        // Zwróć dane z cache
        res.json(global.promotedServersCache.data || []);
    } catch (error) {
        console.error('Error fetching promoted servers:', error);
        res.status(500).json({ error: 'Failed to fetch promoted servers' });
    }
});

app.get('/', async (req, res) => {
    // If cache is empty or stale, update it
    if (!cache.data || Date.now() - cache.lastUpdated > CACHE_TTL) {
        if (!cache.updateInProgress) {
            console.log('Cache stale, triggering update');
            updateCache();
        }
    }

    // Handle referral code
    let referrerInfo = null;
    if (req.query.ref) {
        try {
            const UserProfile = require('../database/models/profile');
            const referrer = await UserProfile.findOne({ referralCode: req.query.ref.toUpperCase() });
            if (referrer) {
                // Try to get username from Discord
                if (global.client) {
                    try {
                        const user = await global.client.users.fetch(referrer.userID);
                        referrerInfo = {
                            username: user.username,
                            code: req.query.ref.toUpperCase()
                        };
                    } catch (e) {
                        referrerInfo = {
                            username: referrer.username || referrer.userID,
                            code: req.query.ref.toUpperCase()
                        };
                    }
                } else {
                    referrerInfo = {
                        username: referrer.username || referrer.userID,
                        code: req.query.ref.toUpperCase()
                    };
                }
            }
        } catch (e) {
            console.error('Error fetching referrer info:', e);
        }
    }

    // Use cached data
    if (cache.data) {
        try {
            return res.render('index', {
                bot: global.client ? global.client : null,
                sbot: global.serverClient ? global.serverClient : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                bots: cache.data.bots,
                servers: cache.data.serversWithVotes,
                botTags: cache.data.botTagCount,
                serverTags: cache.data.serverTagCount,
                referrerInfo: referrerInfo
            });
        } catch (renderError) {
            console.error('Render error:', renderError);
            return res.status(500).send('Error rendering page, please try again later');
        }
    }

    // Wait for cache if not ready
    try {
        await new Promise(resolve => {
            const checkCache = () => {
                if (cache.data) {
                    resolve();
                } else {
                    setTimeout(checkCache, 100);
                }
            };
            checkCache();
        });

        res.render('index', {
            bot: global.client ? global.client : null,
            sbot: global.serverClient ? global.serverClient : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            bots: cache.data.bots,
            servers: cache.data.serversWithVotes,
            botTags: cache.data.botTagCount,
            serverTags: cache.data.serverTagCount,
            referrerInfo: referrerInfo
        });
    } catch (error) {
        console.error('Error waiting for cache:', error);
        res.status(500).send('Server is initializing, please try again shortly');
    }
});

module.exports = app;