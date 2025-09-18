
const express = require('express');
const app = express.Router();
const ServerShop = require('../../database/models/serverShop');
const ShopPurchase = require('../../database/models/shopPurchase');
const serversdata = require('../../database/models/servers/server');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Rate limiting
const shopLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    max: 30,
    message: 'Zbyt wiele żądań dotyczących sklepu. Spróbuj ponownie za 15 minut.',
});

// Funkcja sprawdzająca limity przedmiotów
function getItemLimit(status) {
    switch (status) {
        case 'BASIC': return 2;
        case 'PRO': return 4;
        case 'GOLD': return 6;
        default: return 1;
    }
}

// Pobierz przedmioty sklepu
app.get('/api/server/:serverID/shop', async (req, res) => {
    try {
        const { serverID } = req.params;
        
        const shop = await ServerShop.findOne({ serverID });
        if (!shop || !shop.isActive) {
            return res.json({ success: true, items: [] });
        }

        const activeItems = shop.items.filter(item => item.isActive);
        res.json({ success: true, items: activeItems });
    } catch (error) {
        console.error('Błąd pobierania sklepu:', error);
        res.status(500).json({ success: false, error: 'Wewnętrzny błąd serwera' });
    }
});

// Pobierz przychód ze sklepu (tylko dla właściciela)
app.get('/api/server/:serverID/shop/revenue', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, error: 'Nie jesteś zalogowany' });
    }

    try {
        const { serverID } = req.params;
        
        const serverdata = await serversdata.findOne({ serverID });
        if (!serverdata || serverdata.ownerID !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Brak uprawnień' });
        }

        const shop = await ServerShop.findOne({ serverID });
        const revenue = shop ? shop.totalRevenue || 0 : 0;

        res.json({ success: true, revenue });
    } catch (error) {
        console.error('Błąd pobierania przychodów:', error);
        res.status(500).json({ success: false, error: 'Wewnętrzny błąd serwera' });
    }
});

// Zarządzanie sklepem - tylko dla właściciela serwera
app.get('/server/:serverID/shop/manage', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }

    try {
        const { serverID } = req.params;
        const serverdata = await serversdata.findOne({ serverID });

        if (!serverdata) {
            return res.status(404).render('404', {
                bot: global.client,
                sbot: global.serverClient,
                path: req.path,
                user: req.user,
                req,
                message: 'Serwer nie został znaleziony'
            });
        }

        if (serverdata.ownerID !== req.user.id) {
            return res.status(403).render('404', {
                bot: global.client,
                sbot: global.serverClient,
                path: req.path,
                user: req.user,
                req,
                message: 'Brak uprawnień'
            });
        }

        const shop = await ServerShop.findOne({ serverID }) || new ServerShop({ serverID, items: [] });
        const purchases = await ShopPurchase.find({ serverID }).sort({ purchaseDate: -1 }).limit(50);
        
        const guild = global.serverClient?.guilds.cache.get(serverID);
        const roles = guild ? Array.from(guild.roles.cache.values())
            .filter(role => !role.managed && role.name !== '@everyone')
            .sort((a, b) => b.position - a.position) : [];

        res.render('servers/shop-manage', {
            bot: global.client,
            sbot: global.serverClient,
            path: req.path,
            user: req.user,
            req,
            serverdata,
            shop,
            purchases,
            roles,
            itemLimit: getItemLimit(serverdata.status)
        });
    } catch (error) {
        console.error('Błąd zarządzania sklepem:', error);
        res.status(500).send('Wewnętrzny błąd serwera');
    }
});

// Dodaj przedmiot do sklepu
app.post('/server/:serverID/shop/item',
    shopLimiter,
    [
        body('name').trim().isLength({ min: 3, max: 50 }).withMessage('Nazwa musi mieć od 3 do 50 znaków'),
        body('description').optional().trim().isLength({ max: 200 }).withMessage('Opis może mieć maksymalnie 200 znaków'),
        body('price').isFloat({ min: 1, max: 1000 }).withMessage('Cena musi być między 1 a 1000 PLN'),
        body('roleID').isString().trim().withMessage('Wybierz rolę')
    ],
    async (req, res) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ success: false, error: 'Nie jesteś zalogowany' });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        try {
            const { serverID } = req.params;
            const { name, description, price, roleID } = req.body;

            const serverdata = await serversdata.findOne({ serverID });
            if (!serverdata || serverdata.ownerID !== req.user.id) {
                return res.status(403).json({ success: false, error: 'Brak uprawnień' });
            }

            let shop = await ServerShop.findOne({ serverID });
            if (!shop) {
                shop = new ServerShop({ serverID, items: [] });
            }

            const itemLimit = getItemLimit(serverdata.status);
            const activeItems = shop.items.filter(item => item.isActive);

            if (activeItems.length >= itemLimit) {
                return res.status(400).json({
                    success: false,
                    error: `Osiągnięto limit przedmiotów (${itemLimit}). Ulepsz serwer, aby dodać więcej.`
                });
            }

            // Sprawdź czy rola już jest używana
            const roleExists = activeItems.some(item => item.roleID === roleID);
            if (roleExists) {
                return res.status(400).json({
                    success: false,
                    error: 'Ta rola jest już używana w innym przedmiocie'
                });
            }

            shop.items.push({
                name,
                description: description || '',
                price: parseFloat(price),
                roleID
            });

            await shop.save();

            res.json({ success: true, message: 'Przedmiot został dodany' });
        } catch (error) {
            console.error('Błąd dodawania przedmiotu:', error);
            res.status(500).json({ success: false, error: 'Wewnętrzny błąd serwera' });
        }
    }
);

// Usuń przedmiot ze sklepu
app.delete('/server/:serverID/shop/item/:itemId', shopLimiter, async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, error: 'Nie jesteś zalogowany' });
    }

    try {
        const { serverID, itemId } = req.params;

        const serverdata = await serversdata.findOne({ serverID });
        if (!serverdata || serverdata.ownerID !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Brak uprawnień' });
        }

        const shop = await ServerShop.findOne({ serverID });
        if (!shop) {
            return res.status(404).json({ success: false, error: 'Sklep nie został znaleziony' });
        }

        const itemIndex = shop.items.findIndex(item => item.id === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, error: 'Przedmiot nie został znaleziony' });
        }

        shop.items[itemIndex].isActive = false;
        await shop.save();

        res.json({ success: true, message: 'Przedmiot został usunięty' });
    } catch (error) {
        console.error('Błąd usuwania przedmiotu:', error);
        res.status(500).json({ success: false, error: 'Wewnętrzny błąd serwera' });
    }
});

// Rozpocznij proces płatności
app.post('/server/:serverID/shop/purchase/:itemId', shopLimiter, async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, error: 'Musisz być zalogowany, aby dokonać zakupu' });
    }

    try {
        const { serverID, itemId } = req.params;

        const shop = await ServerShop.findOne({ serverID });
        if (!shop || !shop.isActive) {
            return res.status(404).json({ success: false, error: 'Sklep nie jest dostępny' });
        }

        const item = shop.items.find(item => item.id === itemId && item.isActive);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Przedmiot nie został znaleziony' });
        }

        // Sprawdź czy użytkownik jest na serwerze
        const guild = global.serverClient?.guilds.cache.get(serverID);
        if (!guild) {
            return res.status(400).json({ success: false, error: 'Bot nie jest na tym serwerze' });
        }

        const member = guild.members.cache.get(req.user.id);
        if (!member) {
            return res.status(400).json({ success: false, error: 'Musisz być członkiem tego serwera, aby dokonać zakupu' });
        }

        // Sprawdź czy użytkownik już ma tę rolę
        if (member.roles.cache.has(item.roleID)) {
            return res.status(400).json({ success: false, error: 'Już posiadasz tę rolę' });
        }

        // Utwórz sesję Stripe
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'blik'],
            line_items: [{
                price_data: {
                    currency: 'pln',
                    product_data: {
                        name: item.name,
                        description: item.description || `Rola na serwerze Discord`,
                    },
                    unit_amount: Math.round(item.price * 100), // Stripe używa groszy
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/server/${serverID}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/server/${serverID}`,
            metadata: {
                serverID,
                itemId,
                buyerID: req.user.id,
                buyerUsername: req.user.username
            }
        });

        // Zapisz zakup w bazie danych
        const purchase = new ShopPurchase({
            serverID,
            buyerID: req.user.id,
            buyerUsername: req.user.username,
            itemId: item.id,
            itemName: item.name,
            roleID: item.roleID,
            price: item.price,
            stripeSessionId: session.id,
            status: 'pending'
        });

        await purchase.save();

        res.json({ success: true, checkoutUrl: session.url });
    } catch (error) {
        console.error('Błąd płatności:', error);
        res.status(500).json({ success: false, error: 'Błąd podczas tworzenia płatności' });
    }
});

// Strona sukcesu płatności
app.get('/server/:serverID/shop/success', async (req, res) => {
    const { session_id } = req.query;
    
    if (!session_id) {
        return res.redirect(`/server/${req.params.serverID}`);
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const purchase = await ShopPurchase.findOne({ stripeSessionId: session_id });

        if (!purchase) {
            return res.redirect(`/server/${req.params.serverID}`);
        }

        res.render('servers/shop-success', {
            bot: global.client,
            sbot: global.serverClient,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req,
            purchase,
            session
        });
    } catch (error) {
        console.error('Błąd strony sukcesu:', error);
        res.redirect(`/server/${req.params.serverID}`);
    }
});

// Webhook Stripe
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Błąd weryfikacji webhook:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        try {
            const purchase = await ShopPurchase.findOne({ stripeSessionId: session.id });
            if (!purchase) {
                console.error('Nie znaleziono zakupu dla sesji:', session.id);
                return res.status(404).send('Purchase not found');
            }

            purchase.stripePaymentIntentId = session.payment_intent;
            purchase.status = 'completed';

            // Przyznaj rolę
            const guild = global.serverClient?.guilds.cache.get(purchase.serverID);
            if (guild) {
                const member = guild.members.cache.get(purchase.buyerID);
                const role = guild.roles.cache.get(purchase.roleID);

                if (member && role) {
                    try {
                        await member.roles.add(role);
                        purchase.roleGranted = true;
                        
                        // Aktualizuj przychody serwera
                        await ServerShop.findOneAndUpdate(
                            { serverID: purchase.serverID },
                            { $inc: { totalRevenue: purchase.price } }
                        );

                        console.log(`Przyznano rolę ${role.name} użytkownikowi ${member.user.username} na serwerze ${guild.name}`);
                    } catch (error) {
                        purchase.errorMessage = `Błąd przyznawania roli: ${error.message}`;
                        console.error('Błąd przyznawania roli:', error);
                    }
                } else {
                    purchase.errorMessage = member ? 'Nie znaleziono roli' : 'Użytkownik nie jest na serwerze';
                }
            } else {
                purchase.errorMessage = 'Bot nie jest na serwerze';
            }

            await purchase.save();
        } catch (error) {
            console.error('Błąd przetwarzania płatności:', error);
        }
    }

    res.json({ received: true });
});

module.exports = app;
