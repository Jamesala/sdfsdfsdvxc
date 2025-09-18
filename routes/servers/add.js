const sanitizeHtml = require('sanitize-html'); // Import sanitize-html
const { serverClient } = require('../../config');
const app = require('express').Router();
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const UserProfile = require('../../database/models/profile');
const { checkAndAwardBadges } = require('../../utils/badgeChecker');

console.success('[Servers] /servers/new.js router loaded.'.brightYellow);

app.get('/servers/new', async (req, res) => {
    if (!req.user) return res.render('404.ejs', {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: 'Musisz być zalogowany, aby dodać serwer.'
    });

    if (!(await global.client.users.fetch(req.user.id)).avatar) {
        return res.render('404.ejs', {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: 'Aby dodać bota, musisz mieć zdjęcie profilowe.'
        });
    }

    if ((await global.client.users.fetch(req.user.id)).createdTimestamp + 2592000000 > Date.now()) return res.render('404.ejs', { // 2592000000 = 30 days
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: 'Aby dodać bota, musisz mieć konto przez co najmniej 30 dni.'
    });

    res.render('servers/new', {
        bot: global.client ? global.client : null,
        sbot: global.sbot,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        serversdata: await global.serversdata
    });
});

app.post('/servers/new', async (req, res) => {
    try {
        if (!req.user) return res.render('404.ejs', {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: 'Musisz być zalogowany, aby dodać bota.'
        });

        let {
            serverID,
            patroniteURL,
            inviteURL,
            stronaURL,
            shortDesc,
            longDesc,
            tags
        } = req.body;

        const serverdata = await serversdata.findOne({
            serverID: serverID
        });

        if (!serverID) return error(res, 'Proszę podać ID serwera.');
        let guildCache = global.serverClient.guilds.cache.get(serverID);
        if (!guildCache) return error(res, `Wygląda na to, że nasz bot nie jest na tym serwerze. Musisz mnie zaprosić na serwer przed dodaniem go. <a href="${global.config.serverClient.invite}&disable_guild_select=true&guild_id=${serverID}" target="_blank">DODAJ BOTA</a>`);

        if (serverdata) return error(res, 'Ten serwer jest już w bazie danych.');
        if (!inviteURL) return error(res, '<strong>[ID Serwera]</strong> jest wymagane.');
        if (inviteURL) {
            try {
                let invite = await global.client.fetchInvite(inviteURL);
                if (!invite.guild) return error(res, '<strong>[URL Zapro.]</strong> nie jest ważnym zaproszeniem na serwer.');
            } catch (e) {
                return error(res, '<strong>[URL Zapro.]</strong> URL nie jest ważnym zaproszeniem na serwer.');
            }
        }

        // Sanitize the descriptions to prevent HTML exploits
        shortDesc = sanitizeHtml(shortDesc.trim(), {
            allowedTags: [], // Strip all HTML tags
            allowedAttributes: {} // Don't allow any attributes
        });

        longDesc = sanitizeHtml(longDesc.trim(), {
            allowedTags: ['b', 'i', 'u', 'a', 'code', 'pre', 'blockquote', 'p', 'br', 'ul', 'ol', 'li'], // Allow some tags like <b>, <i>, <u>, <code>, etc.
            allowedAttributes: {
                a: ['href'], // Only allow 'href' attribute in <a> tags
                img: ['src', 'alt'] // Allow 'src' and 'alt' attributes in <img> tags
            }
        });

        if (!shortDesc || typeof (shortDesc) !== "string") return error(res, '<strong>[Krótki opis]</strong> jest wymagany.');
        if (!longDesc || typeof (longDesc) !== "string") return error(res, '<strong>[Długi opis]</strong> jest wymagany.');

        if (shortDesc.length < 50 || shortDesc.length > 200) return error(res, '<strong>[Krótki opis]</strong> musi mieć od 50 do 200 znaków.');
        if (longDesc.length < 200 || longDesc.length > 5000) return error(res, '<strong>[Długi opis]</strong> musi mieć od <strong>200</strong> do <strong>5000</strong> znaków.');

        if (!tags || typeof (tags) != 'object' || !Array.isArray(tags)) return error(res, '<strong>[Tags]</strong> is required.');

        if (tags.length < 3) return error(res, '<strong>[Tagi]</strong> musi być co najmniej 3.');
        if (tags.length > 7) return error(res, '<strong>[Tagi]</strong> nie możesz przekroczyć 7 tagów.');

        // Dodaj to przed zapisem serwera
        const userProfile = await UserProfile.findOne({ userID: req.user.id });

        // Zapisz serwer
        await new serversdata({
            serverID: serverID,
            ownerID: req.user.id,
            inviteURL: inviteURL,
            patroniteURL: patroniteURL,
            stronaURL: stronaURL,
            shortDesc: shortDesc,
            longDesc: longDesc,
            tags: tags,
            date: Date.now(),
        }).save();

        // Send notification to Discord channel
        global.client.channels.cache.get(global.config.server.channels.botlogs).send({
            content: `<@${req.user.id}> właśnie dodał serwer **${guildCache.name}**\n<${global.config.website.url}/server/${serverID}>`,
            allowedMentions: { users: [req.user.id], roles: [] }
        });

        // Przyznawanie punktów polecającemu (tylko jeśli istnieje referredBy)
        if (userProfile?.referredBy) {
            try {
                console.log(`[DEBUG] Przetwarzanie referencji dla użytkownika ${req.user.id}, referredBy: ${userProfile.referredBy}`);

                const referrerProfile = await UserProfile.findOne({
                    referralCode: userProfile.referredBy
                });

                if (referrerProfile) {
                    const pointsToAdd = referrerProfile.partnerBonuses?.pointsPerServer || 10;
                    console.log(`[DEBUG] Przyznanie ${pointsToAdd} punktów użytkownikowi ${referrerProfile.userID}`);

                    // Wysyłanie logu na kanał reflog
                    if (global.client && global.config.server.channels.reflog) {
                        const referredUser = await global.client.users.fetch(req.user.id).catch(() => null);
                        const referrerUser = await global.client.users.fetch(referrerProfile.userID).catch(() => null);

                        const embed = {
                            color: 0x3498db, // Niebieski kolor
                            title: '🎉 Nowe użycie linku referencyjnego',
                            fields: [{ name: 'Osoba polecająca', value: referrerUser ? `${referrerUser.tag} (${referrerUser.id})` : referrerProfile.userID, inline: true },
                            { name: 'Nowy użytkownik', value: referredUser ? `${referredUser.tag} (${referredUser.id})` : req.user.id, inline: true },
                            { name: 'Serwer', value: guildCache?.name || serverID, inline: false },
                            { name: 'Przyznane punkty', value: pointsToAdd.toString(), inline: true },
                            { name: 'Data', value: new Date().toLocaleString('pl-PL'), inline: true }
                            ],
                            timestamp: new Date()
                        };

                        await global.client.channels.cache.get(global.config.server.channels.reflog).send({
                            embeds: [embed]
                        });
                    }

                    await UserProfile.findOneAndUpdate(
                        { userID: referrerProfile.userID },
                        {
                            $inc: {
                                points: pointsToAdd,
                                referralCount: 1
                            },
                            $push: {
                                transactions: {
                                    type: 'earn',
                                    amount: pointsToAdd,
                                    details: `Punkty za polecenie serwera ${serverID}`,
                                    date: new Date()
                                }
                            }
                        }
                    );

                    // Usuń referredBy tylko jeśli referrer istnieje
                    await UserProfile.findOneAndUpdate(
                        { userID: req.user.id },
                        { $unset: { referredBy: "" } }
                    );
                }
            } catch (err) {
                console.error(`[ERROR] Błąd podczas przetwarzania polecenia:`, err);
                // Kontynuuj nawet jeśli jest błąd w systemie poleceń
            }
        }

        // Sprawdź i przyznaj odznaki po dodaniu serwera
        try {
            const newlyAwarded = await checkAndAwardBadges(req.user.id);
            if (newlyAwarded.length > 0) {
                console.log(`[BADGES] Przyznano ${newlyAwarded.length} odznak użytkownikowi ${req.user.id} po dodaniu serwera`);
            }
        } catch (error) {
            console.error('[BADGES] Error checking badges after adding server:', error);
        }

        res.json({
            success: true,
            message: `Twój serwer został dodany do bazy danych. <a href='/server/${serverID}' class="btn btn-primary">Wyświetl serwer</a>`
        });
    } catch (e) {
        error(res, 'Wygląda na to, że wystąpił błąd. Spróbuj ponownie później. (The administrators have been notified).');
        console.log(e.stack);
    }
});

// Initialize cache with 24h TTL
const aiUsageCache = new NodeCache({ stdTTL: 86400 });

// Rate limiter for API
const aiGenerationLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 2, // Limit each user to 2 requests per window
    message: 'Przekroczono limit 2 generowań dziennie na użytkownika.',
    keyGenerator: (req) => req.user?.id || req.ip
});

// Add this before module.exports = app;
app.post('/api/generate-description', aiGenerationLimiter, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        // Check cache for user usage
        const cacheKey = `ai_usage_${req.user.id}`;
        const usageCount = aiUsageCache.get(cacheKey) || 0;

        if (usageCount >= 2) {
            return res.status(429).json({
                error: 'Osiągnięto dzienny limit 2 generowań. Spróbuj jutro.'
            });
        }

        const { prompt, generateShort, generateLong } = req.body;

        // Validate input
        if (!prompt || typeof prompt !== 'string' || prompt.length > 500) {
            return res.status(400).json({ error: 'Nieprawidłowa podpowiedź' });
        }

        if (!generateShort && !generateLong) {
            return res.status(400).json({ error: 'Wybierz przynajmniej jeden typ opisu' });
        }

        // Initialize Google Gemini
        const { GoogleGenAI } = require("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

        // Track usage
        aiUsageCache.set(cacheKey, usageCount + 1);

        // Generate descriptions (with safety settings)
        let shortDesc = '';
        let longDesc = '';

        if (generateShort) {
            const shortResponse = await ai.models.generateContent({
                model: "gemini-2.0-flash-exp",
                contents: `${prompt} Wygeneruj krótki opis (50-200 znaków) serwera Discord w języku polskim. NIE używaj formatowania Markdown - tylko czysty tekst.`,
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_DANGEROUS",
                        threshold: "BLOCK_ONLY_HIGH"
                    }
                ]
            });
            shortDesc = shortResponse.text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').substring(0, 200); // Hard limit
        }

        if (generateLong) {
            const longResponse = await ai.models.generateContent({
                model: "gemini-2.0-flash-exp",
                contents: `${prompt} Wygeneruj długi opis (200-1000 znaków) serwera Discord w języku polskim. Uwzględnij sekcje jak "O serwerze", "Zasady", "Eventy". NIE używaj formatowania Markdown - używaj tylko zwykłego tekstu z podziałem na akapity.`,
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_DANGEROUS",
                        threshold: "BLOCK_ONLY_HIGH"
                    }
                ]
            });
            longDesc = longResponse.text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/#{1,6}\s*/g, '').substring(0, 5000); // Hard limit
        }

        res.json({
            success: true,
            shortDesc: shortDesc,
            longDesc: longDesc,
            remaining: 2 - (usageCount + 1) // Show remaining generations
        });

    } catch (error) {
        console.error('Error generating description:', error);
        res.status(500).json({
            error: error.message || 'Wystąpił błąd podczas generowania opisu'
        });
    }
});

// Add this before module.exports = app;
app.get('/api/check-ai-usage', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        const cacheKey = `ai_usage_${req.user.id}`;
        const usageCount = aiUsageCache.get(cacheKey) || 0;

        res.json({
            success: true,
            used: usageCount,
            remaining: 2 - usageCount
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;