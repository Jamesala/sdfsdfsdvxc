
const app = require("express").Router();
const ServerShop = require("../../database/models/serverShop");
const ShopPurchase = require("../../database/models/shopPurchase");
const serversdata = require("../../database/models/servers/server");

console.success("[Dashboard] Shop router loaded.".brightYellow);

app.get("/dashboard/shop", async (req, res) => {
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
        const purchases = await ShopPurchase.find().sort({ purchaseDate: -1 }).limit(100);
        const shops = await ServerShop.find();
        const servers = await serversdata.find();
        
        // Połącz dane
        const enrichedPurchases = purchases.map(purchase => {
            const server = servers.find(s => s.serverID === purchase.serverID);
            const shop = shops.find(s => s.serverID === purchase.serverID);
            return {
                ...purchase.toObject(),
                serverName: server?.serverName || 'Nieznany serwer',
                serverStatus: server?.status || 'NONE',
                totalRevenue: shop?.totalRevenue || 0
            };
        });

        // Statystyki
        const stats = {
            totalPurchases: purchases.length,
            completedPurchases: purchases.filter(p => p.status === 'completed').length,
            pendingPurchases: purchases.filter(p => p.status === 'pending').length,
            failedPurchases: purchases.filter(p => p.status === 'failed').length,
            totalRevenue: shops.reduce((sum, shop) => sum + (shop.totalRevenue || 0), 0),
            topServers: shops.sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0)).slice(0, 5)
        };

        res.render("dashboard/shop", {
            bot: global.client ? global.client : null,
            sbot: global.serverClient ? global.serverClient : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            purchases: enrichedPurchases,
            stats,
            servers
        });
    } catch (err) {
        console.error(err);
        res.render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Błąd podczas ładowania danych o zakupach"
        });
    }
});

// Zmień status zakupu
app.post("/dashboard/shop/purchase/:purchaseId/status", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false, message: "Nieautoryzowany dostęp" });

    if (!config.client.owners.includes(req.user.id)) return res.status(403).json({ 
        success: false, 
        message: "Brak uprawnień" 
    });

    try {
        const { purchaseId } = req.params;
        const { status } = req.body;

        if (!['pending', 'completed', 'failed', 'cancelled'].includes(status)) {
            return res.status(400).json({ success: false, message: "Nieprawidłowy status" });
        }

        const purchase = await ShopPurchase.findById(purchaseId);
        if (!purchase) {
            return res.status(404).json({ success: false, message: "Zakup nie został znaleziony" });
        }

        const oldStatus = purchase.status;
        purchase.status = status;

        // Jeśli zmieniamy na completed, spróbuj przyznać rolę
        if (status === 'completed' && oldStatus !== 'completed') {
            const guild = global.serverClient?.guilds.cache.get(purchase.serverID);
            if (guild) {
                const member = guild.members.cache.get(purchase.buyerID);
                const role = guild.roles.cache.get(purchase.roleID);

                if (member && role) {
                    try {
                        await member.roles.add(role);
                        purchase.roleGranted = true;
                        purchase.errorMessage = null;
                    } catch (error) {
                        purchase.errorMessage = `Błąd przyznawania roli: ${error.message}`;
                    }
                }
            }
        }

        await purchase.save();

        res.json({ success: true, message: "Status zakupu został zaktualizowany" });
    } catch (error) {
        console.error('Błąd zmiany statusu:', error);
        res.status(500).json({ success: false, message: "Wewnętrzny błąd serwera" });
    }
});

// Zaktualizuj przychody serwera
app.post("/dashboard/shop/server/:serverID/revenue", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false, message: "Nieautoryzowany dostęp" });

    if (!config.client.owners.includes(req.user.id)) return res.status(403).json({ 
        success: false, 
        message: "Brak uprawnień" 
    });

    try {
        const { serverID } = req.params;
        const { revenue } = req.body;

        if (typeof revenue !== 'number' || revenue < 0) {
            return res.status(400).json({ success: false, message: "Nieprawidłowa kwota przychodów" });
        }

        let shop = await ServerShop.findOne({ serverID });
        if (!shop) {
            shop = new ServerShop({ serverID, totalRevenue: revenue });
        } else {
            shop.totalRevenue = revenue;
        }

        await shop.save();

        res.json({ success: true, message: "Przychody zostały zaktualizowane" });
    } catch (error) {
        console.error('Błąd aktualizacji przychodów:', error);
        res.status(500).json({ success: false, message: "Wewnętrzny błąd serwera" });
    }
});

module.exports = app;
