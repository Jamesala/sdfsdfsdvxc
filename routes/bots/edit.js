const app = require('express').Router();
const { fetch } = require("undici");
const mongoose = require('mongoose');

console.success('[Bots] /bots/edit.js router loaded.'.brightYellow);
const botsdata = require("../../database/models/bots/bots.js");

// Funkcja pomocnicza do walidacji URL
const isValidURL = (url) => {
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
};

app.get("/bots/edit/:botID", async (req, res) => {
    if (!req.user) return res.render("404.ejs", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: "Aby edytować bota, musisz się zalogować."
    });

    const botdata = await botsdata.findOne({
        botID: req.params.botID
    });

    if (!botdata) return res.render("404.ejs", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: "Bot, którego szukasz nie istnieje."
    });

    if (botdata.ownerID != req.user.id && !botdata.coowners.includes(req.user.id)) return res.render("404.ejs", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: "Nie masz uprawnień do edycji tego bota."
    });

    let coowners = [];
    for (let i = 0; botdata.coowners.length > i; i++) {
        try {
            let coowner = await global.client.users.fetch(botdata.coowners[i]);
            if (coowner) coowners.push(coowner);
        } catch (e) { 
            console.error(`Error fetching coowner ${botdata.coowners[i]}:`, e);
        }
    }

    coowners = coowners.filter((item, index) => coowners.indexOf(item) === index);
    coowners = coowners.filter(x => !x.bot && x.id !== botdata.ownerID && x.id !== req.user.id);

    res.render("bots/edit", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        botdata: botdata,
        coowners: coowners
    });
});

app.post('/bots/edit/:botID', async (req, res) => {
    try {
        const ip = req.cf_ip;
        const ratelimit = ratelimitMap.get(ip);
        if (ratelimit && ((ratelimit + 60000) > Date.now())) {
            return res.json({ error: true, message: 'Możesz edytować swojego bota 1 raz na minutę.' });
        }
        ratelimitMap.set(ip, Date.now());

        if (!req.user) return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Aby edytować bota, musisz się zalogować."
        });

        const botdata = await botsdata.findOne({
            botID: req.params.botID
        });

        if (!botdata) return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Bot, którego szukasz nie istnieje."
        });

        let {
            prefix,
            inviteURL,
            supportURL,
            websiteURL,
            webhookURL,
            githubURL,
            donateURL,
            tags,
            shortDesc,
            longDesc,
            coowners,
            faq,
            commands,
            framework,
            customBannerURL,
            vanityURL
        } = req.body;

        // Walidacja frameworka
        if (framework && !['Discord.js', 'Discord.py', 'Eris', 'JDA', 'Discord4J', 'Disnake', 'Nextcord', 'Pycord', 'Other'].includes(framework)) {
            return res.json({ error: true, message: 'Wybierz poprawny framework z listy.' });
        }

        // Walidacja custom banner URL
        if (customBannerURL && customBannerURL.trim() !== '') {
            if (!isValidURL(customBannerURL)) {
                return res.json({ error: true, message: 'Niestandardowy link do tła musi być prawidłowym URL.' });
            }
            if (!/\.(png|jpg|jpeg|webp)$/i.test(customBannerURL)) {
                return res.json({ error: true, message: 'Niestandardowy link do tła musi wskazywać na obraz (PNG, JPG, WEBP).' });
            }
        } else {
            customBannerURL = '';
        }

        // Walidacja vanity URL
        if (vanityURL && vanityURL.trim() !== '') {
            const invalidChars = /[^\w\-]/;
            if (invalidChars.test(vanityURL)) {
                return res.json({ error: true, message: 'Unikalny URL może zawierać tylko litery, cyfry i myślniki.' });
            }
            
            const blockedWords = ['admin', 'moderator', 'discord', 'help', 'bot', 'support', 'official', 
                                'kurwa', 'pizda', 'chuj', 'jebac', 'skurwysyn', 'gówno', 'spierdalaj'];
            const cleanedURL = vanityURL.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            for (let word of blockedWords) {
                if (cleanedURL.includes(word)) {
                    return res.json({ error: true, message: `Unikalny URL zawiera niedozwolone słowo: ${word}` });
                }
            }

            // Sprawdź unikalność vanity URL
            const existingBot = await botsdata.findOne({ 
                vanityURL: vanityURL,
                botID: { $ne: req.params.botID }
            });
            
            if (existingBot) {
                return res.json({ 
                    error: true, 
                    message: 'Ten vanity URL jest już zajęty przez innego bota' 
                });
            }
        } else {
            vanityURL = '';
        }

		
		// Walidacja Komend
        if (!Array.isArray(commands)) commands = [];
        commands = commands.map(item => {
            if (item && typeof item.name === 'string' && typeof item.description === 'string') {
                return {
                    name: item.name.trim(),
                    description: item.description.trim()
                };
            }
        }).filter(Boolean);

        if (commands.length > 40) return res.json({ error: true, message: '<strong>[Komendy]</strong> nie może mieć więcej niż 40 pozycji.' });

        // Sprawdzenie długości komend
        for (let cmd of commands) {
            if (cmd.name.length > 30) return res.json({ error: true, message: '<strong>[Nazwa Komendy]</strong> nie może mieć więcej niż 30 znaków.' });
            if (cmd.description.length > 100) return res.json({ error: true, message: '<strong>[Opis Komendy]</strong> nie może mieć więcej niż 100 znaków.' });
        }

        // Process FAQ (Trimming, validation, and character limits)
        if (Array.isArray(faq)) {
            faq = faq.map(item => {
                if (item && typeof item.question === 'string' && typeof item.answer === 'string') {
                    const question = item.question.trim();
                    const answer = item.answer.trim();

                    // Validate question length (max 50 characters)
                    if (question.length > 50) return null;

                    // Validate answer length (max 100 characters)
                    if (answer.length > 100) return null;

                    return { question, answer };
                }
                return null;
            }).filter(Boolean); // Removing invalid entries
        } else {
            faq = [];
        }

        if (faq.length > 10) return res.json({ error: true, message: '<strong>[FAQ]</strong> nie może mieć więcej niż 10 pozycji.' });

        // Trimowanie opisów
        longDesc = longDesc.trim();
        shortDesc = shortDesc.trim();
		longDesc = longDesc.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                   .replace(/javascript:/gi, '')
                   .replace(/on\w+="[^"]*"/gi, '');

        // Walidacja pól
        if (!prefix || typeof (prefix) !== "string") return res.json({ error: true, message: '<strong>[Prefix]</strong> jest wymagany.' });
        if (!longDesc || typeof (longDesc) !== "string") return res.json({ error: true, message: '<strong>[Długi Opis]</strong> jest wymagany.' });
        if (!shortDesc || typeof (shortDesc) !== "string") return res.json({ error: true, message: '<strong>[Krótki Opis]</strong> jest wymagany.' });

        if (shortDesc.length < 50 || shortDesc.length > 140) return res.json({ error: true, message: '<strong>[Krótki Opis]</strong> musi być od 50 do 140 znaków.' });
        if (longDesc.length < 200 || longDesc.length > 5000) return res.json({ error: true, message: '<strong>[Długi Opis]</strong> musi być od 200 do 5000 znaków.' });

        if (!tags || typeof (tags) !== 'object' || !Array.isArray(tags)) return res.json({ error: true, message: '<strong>[Tagi]</strong> są wymagane.' });
        if (!tags.every(tag => config.website.botTags.includes(tag))) return res.json({ error: true, message: `<strong>[Tagi]</strong> musi być jednym z następujących: ${config.website.botTags.map(tag => `<code>${tag}</code>`).join(', ')}` });
        if (tags.length < 3) return res.json({ error: true, message: '<strong>[Tagi]</strong> musi być co najmniej 3.' });
        if (tags.length > 20) return res.json({ error: true, message: '<strong>[Tagi]</strong> nie możesz przekroczyć 20 tagów.' });

        // Walidacja Support URL
        if (supportURL) {
            try {
                let invite = await global.client.fetchInvite(supportURL);
                if (!invite.guild) return res.json({ error: true, message: '<strong>[URL Zaproszenia]</strong> nie jest ważnym zaproszeniem.' });
            } catch (e) {
                return res.json({ error: true, message: '<strong>[URL Zaproszenia]</strong> nie jest ważnym zaproszeniem.' });
            }
        }

        // Walidacja Webhook URL
        if (webhookURL) {
            try {
                const resp = await fetch(webhookURL);
                if (!resp.ok) return res.json({ error: true, message: '<strong>[Webhook URL]</strong> nie jest poprawny.' });
            } catch (e) {
                return res.json({ error: true, message: '<strong>[Webhook URL]</strong> nie jest poprawny.' });
            }
        }

if (coowners) {
    coowners = coowners.filter((item, index) => coowners.indexOf(item) === index);
    
    // Sprawdź limit współwłaścicieli (max 3)
    if (coowners.length > 3) {
        return res.json({ error: true, message: 'Możesz dodać maksymalnie 3 współwłaścicieli.' });
    }
    
    // Sprawdź każdego coownera
    const validCoowners = [];
    for (const x of coowners) {
        try {
            const user = await global.client.users.fetch(x).catch(() => null);
            if (user && !user.bot && user.id !== botdata.ownerID && user.id !== req.user.id) {
                validCoowners.push(x);
            }
        } catch (e) {
            console.error(`Error validating coowner ${x}:`, e);
        }
    }
    coowners = validCoowners;
}

        // Aktualizacja danych w bazie
        await botsdata.findOneAndUpdate(
            { botID: req.params.botID },
            {
                $set: {
                    prefix: prefix,
                    inviteURL: inviteURL,
                    supportURL: supportURL,
                    websiteURL: websiteURL,
                    donateURL: donateURL,
                    webhookURL: webhookURL,
                    githubURL: githubURL,
                    tags: tags,
                    shortDesc: shortDesc,
                    longDesc: longDesc,
                    coowners: coowners,
                    faq: faq,
                    commands: commands,
                    framework: framework,
                    customBannerURL: customBannerURL,
                    vanityURL: vanityURL
                }
            },
            { upsert: true }
        );

        res.json({
            error: false,
            message: `Pomyślnie edytowałeś swojego bota. <a href="/bot/${req.params.botID}" class="btn btn-primary">Zobacz stronę</a>`
        });

        global.client.channels.cache.get(global.config.server.channels.zmiany).send({
            content: `<@${req.user.id}>${coowners?.length ? `, ${coowners.map(u => `<@${u}>`).join(', ')}` : ''} zedytował ${botdata.username}\n<${global.config.website.url}/bot/${botdata.botID}>`,
            allowedMentions: { users: [req.user.id], roles: [] }
        });

    } catch (e) {
        console.log(e.stack);
        return res.json({
            error: true,
            message: 'Wystąpił błąd. Spróbuj ponownie później.'
        });
    }
});

module.exports = app;
