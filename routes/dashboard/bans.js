
const app = require("express").Router();
const BlockedUser = require("../../database/models/BlockedUser");

console.log("[Dashboard] /bans router loaded.".brightYellow);

// Trasa do wyświetlania oraz dodawania zbanowanych użytkowników
app.route("/dashboard/bans")
    .get(async (req, res) => {
        if (!req.isAuthenticated()) return res.render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "You need to be logged in to view this page."
        });

        // Sprawdzenie czy użytkownik jest właścicielem (używamy zmiennych środowiskowych)
        const owners = process.env.OWNERS ? process.env.OWNERS.split(',') : [];
        if (!owners.includes(req.user.id)) return res.render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "You cannot access this page."
        });

        // Pobieramy wszystkich zbanowanych użytkowników
        const bannedUsers = await BlockedUser.find().sort({ dateBlocked: -1 });

        res.render("dashboard/bans", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            bannedUsers: bannedUsers
        });
    })
    .post(async (req, res) => {
        const { userId, reason } = req.body;

        console.log('Formularz:', req.body);

        if (!userId || !reason) {
            const bannedUsers = await BlockedUser.find().sort({ dateBlocked: -1 });
            return res.render("dashboard/bans", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                bannedUsers: bannedUsers,
                message: "Wszystkie pola muszą być wypełnione."
            });
        }

        // Walidacja ID użytkownika (Discord ID format)
        if (!/^\d{17,19}$/.test(userId)) {
            const bannedUsers = await BlockedUser.find().sort({ dateBlocked: -1 });
            return res.render("dashboard/bans", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                bannedUsers: bannedUsers,
                message: "ID użytkownika musi być prawidłowym Discord ID."
            });
        }

        // Sprawdzamy, czy użytkownik już istnieje w bazie danych
        const existingBan = await BlockedUser.findOne({ userId });

        if (existingBan) {
            const bannedUsers = await BlockedUser.find().sort({ dateBlocked: -1 });
            return res.render("dashboard/bans", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                bannedUsers: bannedUsers,
                message: "Ten użytkownik jest już zbanowany."
            });
        }

        const newBan = new BlockedUser({
            userId,
            reason,
            dateBlocked: new Date(),
        });

        try {
            await newBan.save();

            // Logowanie bana do kanału "bans"
            const bansChannelId = process.env.BANS_CHANNEL_ID;
            if (global.client && bansChannelId) {
                try {
                    await global.client.channels.cache.get(bansChannelId).send({
                        content: `\`⛔\` Użytkownik ${userId} został zbanowany.\n\`📌\` Powód: ${reason}\n\`👤\` Przez: ${req.user.username || req.user.id}`
                    });
                } catch (discordError) {
                    console.error('Błąd podczas wysyłania wiadomości na Discord:', discordError);
                }
            }

            res.redirect("/dashboard/bans");
        } catch (error) {
            console.error('Błąd podczas dodawania banowania użytkownika:', error);
            res.redirect("/dashboard/bans");
        }
    });

// Trasa do usuwania zbanowanego użytkownika
app.get("/dashboard/bans/delete/:id", async (req, res) => {
    const owners = process.env.OWNERS ? process.env.OWNERS.split(',') : [];
    if (!req.isAuthenticated() || !owners.includes(req.user.id)) {
        return res.redirect("/dashboard/bans");
    }

    const bannedUser = await BlockedUser.findById(req.params.id);
    if (bannedUser) {
        await BlockedUser.findByIdAndDelete(req.params.id);

        // Logowanie usunięcia bana
        const bansChannelId = process.env.BANS_CHANNEL_ID;
        if (global.client && bansChannelId) {
            try {
                await global.client.channels.cache.get(bansChannelId).send({
                    content: `\`✅\` Użytkownik **${bannedUser.userId}** został odbanowany.`
                });
            } catch (discordError) {
                console.error('Błąd podczas wysyłania wiadomości na Discord:', discordError);
            }
        }
    }
    
    res.redirect("/dashboard/bans");
});

module.exports = app;
