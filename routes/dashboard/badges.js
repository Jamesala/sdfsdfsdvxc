
const app = require("express").Router();
const { Badge, UserBadge } = require("../../database/models/badge");

console.success("[Dashboard] /badges router loaded.".brightYellow);

// Lista odznak
app.get("/dashboard/badges", async (req, res) => {
    if (!req.isAuthenticated()) return res.render("404", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: "Musisz być zalogowany aby zobaczyć tę stronę."
    });

    if (!config.client.owners.includes(req.user.id) && !global.client.guilds.cache.get(config.server.id).members.cache.get(req.user.id).roles.cache.has(config.server.roles.botReviewer)) {
        return res.render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Nie masz uprawnień do tej strony."
        });
    }

    try {
        const badges = await Badge.find().sort({ createdAt: -1 });
        
        // Pobierz statystyki dla każdej odznaki
        const badgesWithStats = await Promise.all(badges.map(async (badge) => {
            const earnedCount = await UserBadge.countDocuments({ badgeID: badge._id });
            return {
                ...badge.toObject(),
                earnedCount
            };
        }));

        res.render("dashboard/badges", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.user,
            req: req,
            badges: badgesWithStats
        });
    } catch (error) {
        console.error("Error loading badges:", error);
        res.status(500).json({ error: "Błąd serwera" });
    }
});

// Dodawanie nowej odznaki
app.post("/dashboard/badges/create", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    if (!config.client.owners.includes(req.user.id) && !global.client.guilds.cache.get(config.server.id).members.cache.get(req.user.id).roles.cache.has(config.server.roles.botReviewer)) {
        return res.status(403).json({ error: "Forbidden" });
    }

    try {
        const { name, description, category, requirementType, requirementOperator, requirementValue, isLevelBased, levels, imageUrl, color, rarity } = req.body;

        if (!name || !description || !category || !requirementType) {
            return res.status(400).json({ error: "Nazwa, opis, kategoria i typ wymagania są wymagane" });
        }

        const badge = new Badge({
            name,
            description,
            category,
            imageUrl: imageUrl || 'https://cdn.discordapp.com/attachments/000000000000000000/default-badge.png',
            color: color || '#6d5bff',
            rarity: rarity || 'common',
            requirements: {
                type: requirementType,
                operator: requirementOperator || '>=',
                value: requirementType !== 'manual' ? parseInt(requirementValue) || 0 : undefined
            },
            isLevelBased: isLevelBased === 'true',
            levels: isLevelBased === 'true' && levels ? JSON.parse(levels) : [],
            isActive: req.body.isActive === 'true'
        });

        await badge.save();
        res.json({ success: true, badge });
    } catch (error) {
        console.error("Error creating badge:", error);
        res.status(500).json({ error: "Błąd serwera" });
    }
});

// Edycja odznaki
app.post("/dashboard/badges/edit/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    if (!config.client.owners.includes(req.user.id) && !global.client.guilds.cache.get(config.server.id).members.cache.get(req.user.id).roles.cache.has(config.server.roles.botReviewer)) {
        return res.status(403).json({ error: "Forbidden" });
    }

    try {
        const { name, description, category, requirementType, requirementOperator, requirementValue, isLevelBased, levels, isActive, imageUrl, color, rarity } = req.body;
        
        const badge = await Badge.findByIdAndUpdate(req.params.id, {
            name,
            description,
            category,
            imageUrl: imageUrl || 'https://cdn.discordapp.com/attachments/000000000000000000/default-badge.png',
            color: color || '#6d5bff',
            rarity: rarity || 'common',
            requirements: {
                type: requirementType,
                operator: requirementOperator || '>=',
                value: requirementType !== 'manual' ? parseInt(requirementValue) || 0 : undefined
            },
            isLevelBased: isLevelBased === 'true',
            levels: isLevelBased === 'true' && levels ? JSON.parse(levels) : [],
            isActive: isActive === 'true'
        }, { new: true });

        if (!badge) {
            return res.status(404).json({ error: "Odznaka nie znaleziona" });
        }

        res.json({ success: true, badge });
    } catch (error) {
        console.error("Error updating badge:", error);
        res.status(500).json({ error: "Błąd serwera" });
    }
});

// Usunięcie odznaki
app.post("/dashboard/badges/delete/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    if (!config.client.owners.includes(req.user.id) && !global.client.guilds.cache.get(config.server.id).members.cache.get(req.user.id).roles.cache.has(config.server.roles.botReviewer)) {
        return res.status(403).json({ error: "Forbidden" });
    }

    try {
        const badge = await Badge.findByIdAndDelete(req.params.id);
        if (!badge) {
            return res.status(404).json({ error: "Odznaka nie znaleziona" });
        }

        // Usuń wszystkie przyznane odznaki tego typu
        await UserBadge.deleteMany({ badgeID: req.params.id });

        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting badge:", error);
        res.status(500).json({ error: "Błąd serwera" });
    }
});

// Manualne przyznawanie odznaki użytkownikowi
app.post("/dashboard/badges/award-manual", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    if (!config.client.owners.includes(req.user.id) && !global.client.guilds.cache.get(config.server.id).members.cache.get(req.user.id).roles.cache.has(config.server.roles.botReviewer)) {
        return res.status(403).json({ error: "Forbidden" });
    }

    try {
        const { userID, badgeID } = req.body;

        if (!userID || !badgeID) {
            return res.status(400).json({ error: "ID użytkownika i ID odznaki są wymagane" });
        }

        // Sprawdź czy odznaka istnieje
        const badge = await Badge.findById(badgeID);
        if (!badge) {
            return res.status(404).json({ error: "Odznaka nie znaleziona" });
        }

        // Sprawdź czy użytkownik istnieje na Discordzie
        let user;
        try {
            user = await global.client.users.fetch(userID);
        } catch (error) {
            return res.status(404).json({ error: "Użytkownik nie znaleziony na Discordzie" });
        }

        // Sprawdź czy użytkownik już ma tę odznakę
        const existingBadge = await UserBadge.findOne({
            userID: userID,
            badgeID: badgeID
        });

        if (existingBadge) {
            return res.status(400).json({ error: "Użytkownik już posiada tę odznakę" });
        }

        // Przyznaj odznakę
        const userBadge = new UserBadge({
            userID: userID,
            badgeID: badgeID,
            awardedManually: true,
            awardedBy: req.user.id
        });

        await userBadge.save();

        // Logowanie do kanału
        if (global.client && global.config.server.channels.reflog) {
            try {
                await global.client.channels.cache.get(global.config.server.channels.reflog).send({
                    embeds: [{
                        color: 0x00ff00,
                        title: '🏆 Odznaka przyznana manualnie',
                        fields: [
                            { name: 'Użytkownik', value: `<@${userID}> (${user.username})`, inline: true },
                            { name: 'Odznaka', value: badge.name, inline: true },
                            { name: 'Przyznane przez', value: `<@${req.user.id}> (${req.user.username})`, inline: true }
                        ],
                        thumbnail: { url: badge.imageUrl },
                        timestamp: new Date()
                    }]
                });
            } catch (e) {
                console.error('Error logging manual badge award:', e);
            }
        }

        res.json({ 
            success: true, 
            message: `Odznaka "${badge.name}" została przyznana użytkownikowi ${user.username}`,
            badge: badge,
            user: user
        });
    } catch (error) {
        console.error("Error awarding badge manually:", error);
        res.status(500).json({ error: "Błąd serwera" });
    }
});

// Usuwanie odznaki od użytkownika
app.post("/dashboard/badges/remove-from-user", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    if (!config.client.owners.includes(req.user.id) && !global.client.guilds.cache.get(config.server.id).members.cache.get(req.user.id).roles.cache.has(config.server.roles.botReviewer)) {
        return res.status(403).json({ error: "Forbidden" });
    }

    try {
        const { userID, badgeID } = req.body;

        if (!userID || !badgeID) {
            return res.status(400).json({ error: "ID użytkownika i ID odznaki są wymagane" });
        }

        const userBadge = await UserBadge.findOneAndDelete({
            userID: userID,
            badgeID: badgeID
        });

        if (!userBadge) {
            return res.status(404).json({ error: "Użytkownik nie posiada tej odznaki" });
        }

        const badge = await Badge.findById(badgeID);
        let user;
        try {
            user = await global.client.users.fetch(userID);
        } catch (error) {
            user = { username: userID };
        }

        // Logowanie do kanału
        if (global.client && global.config.server.channels.reflog) {
            try {
                await global.client.channels.cache.get(global.config.server.channels.reflog).send({
                    embeds: [{
                        color: 0xff0000,
                        title: '🗑️ Odznaka usunięta',
                        fields: [
                            { name: 'Użytkownik', value: `<@${userID}> (${user.username})`, inline: true },
                            { name: 'Odznaka', value: badge?.name || 'Nieznana', inline: true },
                            { name: 'Usunięte przez', value: `<@${req.user.id}> (${req.user.username})`, inline: true }
                        ],
                        timestamp: new Date()
                    }]
                });
            } catch (e) {
                console.error('Error logging badge removal:', e);
            }
        }

        res.json({ 
            success: true, 
            message: `Odznaka została usunięta od użytkownika ${user.username}`
        });
    } catch (error) {
        console.error("Error removing badge from user:", error);
        res.status(500).json({ error: "Błąd serwera" });
    }
});

// Sprawdzanie odznak dla wszystkich użytkowników (endpoint administratora)
app.post("/dashboard/badges/check-all", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    if (!config.client.owners.includes(req.user.id)) {
        return res.status(403).json({ error: "Tylko właściciele mogą uruchomić sprawdzanie dla wszystkich" });
    }

    try {
        const { checkAndAwardBadges } = require("../../utils/badgeChecker");
        let totalUpdated = 0;

        // Pobierz wszystkie profile użytkowników
        const profiles = await global.UserProfile.find({});
        
        for (const profile of profiles) {
            const results = await checkAndAwardBadges(profile.userID);
            totalUpdated += results.length;
        }

        res.json({ success: true, updated: totalUpdated });
    } catch (error) {
        console.error("Error checking badges:", error);
        res.status(500).json({ error: "Błąd serwera" });
    }
});

// Funkcja sprawdzająca czy użytkownik spełnia wymagania odznaki
async function checkBadgeRequirements(userID, badge) {
    try {
        const profile = await global.UserProfile.findOne({ userID });
        if (!profile) return false;

        const requirement = badge.requirements;
        
        // Odznaki typu 'manual' nie mogą być przyznane automatycznie
        if (requirement.type === 'manual') {
            return false;
        }
        
        let userValue = 0;

        switch (requirement.type) {
            case 'bumps':
                // Zlicz bumpy użytkownika ze wszystkich serwerów
                const userServers = await global.serversdata.find({ 'owners.id': userID });
                userValue = userServers.reduce((total, server) => total + (server.bump?.count || 0), 0);
                break;
            
            case 'reviews':
                // Zlicz komentarze/recenzje użytkownika
                const userBots = await global.botsdata.find({ 'owners.id': userID });
                const userServersList = await global.serversdata.find({ 'owners.id': userID });
                const botComments = userBots.reduce((total, bot) => total + (bot.comments?.length || 0), 0);
                const serverComments = userServersList.reduce((total, server) => total + (server.comments?.length || 0), 0);
                userValue = botComments + serverComments;
                break;
            
            case 'joinDate':
                // Sprawdź ile dni temu użytkownik dołączył
                const joinDate = profile.createdAt || new Date();
                const daysSinceJoin = Math.floor((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
                userValue = daysSinceJoin;
                break;
            
            case 'referrals':
                userValue = profile.referralCount || 0;
                break;
            
            case 'servers':
                const ownedServers = await global.serversdata.countDocuments({ 'owners.id': userID });
                userValue = ownedServers;
                break;
        }

        // Sprawdź operator
        switch (requirement.operator) {
            case '>=': return userValue >= requirement.value;
            case '>': return userValue > requirement.value;
            case '=': return userValue === requirement.value;
            case '<': return userValue < requirement.value;
            case '<=': return userValue <= requirement.value;
            default: return false;
        }
    } catch (error) {
        console.error("Error checking badge requirements:", error);
        return false;
    }
}

// Tworzenie przykładowych odznak poziomowych
app.post("/dashboard/badges/create-samples", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

    if (!config.client.owners.includes(req.user.id)) {
        return res.status(403).json({ error: "Tylko właściciele mogą tworzyć przykładowe odznaki" });
    }

    try {
        const sampleBadges = [
            {
                name: "Recenzent",
                description: "Odznaka za pisanie recenzji botów i serwerów",
                category: "reviews",
                requirements: { type: "reviews", operator: ">=" },
                isLevelBased: true,
                levels: [
                    {
                        level: 1,
                        name: "Brązowy Recenzent",
                        description: "Napisał pierwszą recenzję",
                        imageUrl: "https://cdn.discordapp.com/attachments/000000000000000000/bronze-reviewer.png",
                        requiredValue: 1,
                        color: "#CD7F32"
                    },
                    {
                        level: 2,
                        name: "Srebrny Recenzent",
                        description: "Napisał 5 recenzji",
                        imageUrl: "https://cdn.discordapp.com/attachments/000000000000000000/silver-reviewer.png",
                        requiredValue: 5,
                        color: "#C0C0C0"
                    },
                    {
                        level: 3,
                        name: "Złoty Recenzent",
                        description: "Napisał 25 recenzji",
                        imageUrl: "https://cdn.discordapp.com/attachments/000000000000000000/gold-reviewer.png",
                        requiredValue: 25,
                        color: "#FFD700"
                    },
                    {
                        level: 4,
                        name: "Platynowy Recenzent",
                        description: "Napisał 100 recenzji",
                        imageUrl: "https://cdn.discordapp.com/attachments/000000000000000000/platinum-reviewer.png",
                        requiredValue: 100,
                        color: "#E5E4E2"
                    }
                ],
                isActive: true
            },
            {
                name: "Promotor Serwera",
                description: "Odznaka za bumpowanie serwerów",
                category: "bumps",
                requirements: { type: "bumps", operator: ">=" },
                isLevelBased: true,
                levels: [
                    {
                        level: 1,
                        name: "Początkujący Promotor",
                        description: "Wykonał 10 bumpów",
                        imageUrl: "https://cdn.discordapp.com/attachments/000000000000000000/bronze-bumper.png",
                        requiredValue: 10,
                        color: "#CD7F32"
                    },
                    {
                        level: 2,
                        name: "Aktywny Promotor",
                        description: "Wykonał 50 bumpów",
                        imageUrl: "https://cdn.discordapp.com/attachments/000000000000000000/silver-bumper.png",
                        requiredValue: 50,
                        color: "#C0C0C0"
                    },
                    {
                        level: 3,
                        name: "Ekspert Promocji",
                        description: "Wykonał 200 bumpów",
                        imageUrl: "https://cdn.discordapp.com/attachments/000000000000000000/gold-bumper.png",
                        requiredValue: 200,
                        color: "#FFD700"
                    }
                ],
                isActive: true
            }
        ];

        const createdBadges = [];
        for (const badgeData of sampleBadges) {
            const badge = new Badge(badgeData);
            await badge.save();
            createdBadges.push(badge);
        }

        res.json({ success: true, badges: createdBadges });
    } catch (error) {
        console.error("Error creating sample badges:", error);
        res.status(500).json({ error: "Błąd serwera" });
    }
});

module.exports = app;
