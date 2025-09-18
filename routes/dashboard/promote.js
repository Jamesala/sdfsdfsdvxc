const app = require("express").Router();

console.success("[Dashboard] Promotion router loaded.".brightYellow);

app.get("/dashboard/promote", async (req, res) => {
    if (!req.isAuthenticated()) return res.render("404", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: "Musisz być zalogowany aby przeglądać tę stronę."
    });

    if (!config.client.owners.includes(req.user.id)) return res.render("404", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        message: "Nie masz uprawnień do tej strony."
    });

    try {
        const promotedServers = await global.serversdata.find({
            $or: [
                { promotedUntil: { $gt: new Date() } },
                { status: { $in: ['BASIC', 'PRO', 'GOLD'] } }
            ]
        }).sort({ promotedUntil: -1 });

        res.render("dashboard/promote", {
            bot: global.client ? global.client : null,
            sbot: global.serverClient ? global.serverClient : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            servers: promotedServers
        });
    } catch (err) {
        console.error(err);
        res.render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Błąd podczas ładowania danych o promocjach"
        });
    }
});

app.post("/dashboard/promote/add", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false, message: "Nieautoryzowany dostęp" });

    if (!config.client.owners.includes(req.user.id)) return res.status(403).json({ 
        success: false, 
        message: "Brak uprawnień" 
    });

    try {
        const { serverId, status } = req.body;
        
        // Ustaw domyślny czas promocji w zależności od statusu
        let promotionDays = 0;
        switch(status) {
            case 'BASIC': promotionDays = 15; break;
            case 'PRO': promotionDays = 40; break;
            case 'GOLD': promotionDays = 60; break;
            default: promotionDays = 7;
        }

        const promotionEnd = new Date();
        promotionEnd.setDate(promotionEnd.getDate() + promotionDays);

        await global.serversdata.updateOne(
            { serverID: serverId },
            { 
                $set: { 
                    promotedUntil: promotionEnd,
                    status: status 
                } 
            },
            { upsert: true }
        );

        res.json({ 
            success: true, 
            message: `Pomyślnie dodano promocję (${status})`,
            promotedUntil: promotionEnd.toISOString(),
            formattedDate: promotionEnd.toLocaleString()
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            success: false, 
            message: "Wystąpił błąd serwera" 
        });
    }
});

app.post("/dashboard/promote/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false, message: "Nieautoryzowany dostęp" });

    if (!config.client.owners.includes(req.user.id)) return res.status(403).json({ 
        success: false, 
        message: "Brak uprawnień" 
    });

    try {
        const { action, days, hours, minutes, status } = req.body;
        const serverId = req.params.id;

        if (action === "remove") {
            await global.serversdata.updateOne(
                { serverID: serverId },
                { $set: { promotedUntil: null, status: null } }
            );
            return res.json({ 
                success: true, 
                message: "Pomyślnie usunięto promocję" 
            });
        }

        const totalMinutes = (parseInt(days) || 0) * 1440 + (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
        if (totalMinutes <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Czas promocji musi być większy niż 0" 
            });
        }

        const promotionEnd = new Date();
        promotionEnd.setMinutes(promotionEnd.getMinutes() + totalMinutes);

        await global.serversdata.updateOne(
            { serverID: serverId },
            { 
                $set: { 
                    promotedUntil: promotionEnd,
                    status: status || null
                } 
            }
        );

        res.json({ 
            success: true, 
            message: "Pomyślnie zaktualizowano promocję",
            promotedUntil: promotionEnd.toISOString(),
            formattedDate: promotionEnd.toLocaleString()
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            success: false, 
            message: "Wystąpił błąd serwera" 
        });
    }
});

module.exports = app;