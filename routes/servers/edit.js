const app = require('express').Router();
const sanitizeHtml = require('sanitize-html'); // Do sanitizacji tekstu

console.success('[Servers] /servers/edit.js router loaded.'.brightYellow);

// Utility function to validate invite URL
const validateInviteURL = async (inviteURL) => {
    if (inviteURL) {
        try {
            let invite = await global.client.fetchInvite(inviteURL);
            if (!invite.guild) {
                throw new Error('[URL Zapro.] nie jest ważnym zaproszeniem na serwer.');
            }
        } catch (e) {
            throw new Error('[URL Zapro.] nie jest ważnym zaproszeniem na serwer.');
        }
    }
};

// Utility function to validate description
const validateDescription = (desc, min, max) => {
    if (!desc || typeof desc !== 'string') return false;
    if (desc.length < min || desc.length > max) return false;
    return true;
};

// Utility function to validate URLs
const isValidURL = (url) => {
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
};

// Map for rate limits
const rateLimitMap = new Map();

// GET route for server edit
app.get("/servers/edit/:id", async (req, res) => {
    if (!req.user) {
        return res.render("404.ejs", {
            bot: global.client || null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req,
            message: "Aby edytować serwer, musisz się zalogować."
        });
    }

    const serverdata = await serversdata.findOne({ serverID: req.params.id });

    if (!serverdata) {
        return res.render("404.ejs", {
            bot: global.client || null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req,
            message: "Serwer, którego szukasz nie istnieje."
        });
    }

    if (serverdata.ownerID !== req.user.id) {
        return res.render("404.ejs", {
            bot: global.client || null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req,
            message: "Nie masz uprawnień do edycji tego serwera."
        });
    }

    res.render("servers/edit", {
        bot: global.client || null,
        sbot: global.serverClient,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req,
        serverdata,
		hasPro: serverdata.status === 'PRO', 
        hasGold: serverdata.status === 'GOLD',
		hasBasic: serverdata.status === 'BASIC'
    });
});

// POST route for server edit
app.post('/servers/edit/:id', async (req, res) => {
    try {
        const ip = req.cf_ip;

        const currentTime = Date.now();


        rateLimitMap.set(ip, currentTime);

        if (!req.user) {
            return res.render("404.ejs", {
                bot: global.client || null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req,
                message: "Aby edytować serwer, musisz się zalogować."
            });
        }

        const serverdata = await serversdata.findOne({ serverID: req.params.id });

        if (!serverdata) {
            return res.render("404.ejs", {
                bot: global.client || null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req,
                message: "Serwer, którego szukasz nie istnieje."
            });
        }

        let {
            inviteURL,
            vanityURL,  // Add vanity URL to the body
            tags,
            patroniteURL,
            stronaURL,
            shortDesc,
            longDesc,
			theme,
			administration,
            customBannerURL,
        } = req.body;


// Walidacja motywu
const validThemes = ['default', 'dark', 'pink', 'purple', 'green', 'red']; // Podstawowe motywy
const premiumThemes = ['cat-rain', 'money-rain', 'beer-rain']; // Motywy premium

// Sprawdź czy motyw jest na liście dozwolonych
if (!validThemes.includes(theme) && !premiumThemes.includes(theme)) {
    theme = 'default';
}

// Sprawdź uprawnienia dla motywów premium
if (premiumThemes.includes(theme)) {
    const hasPro = serverdata.status === 'PRO';
    const hasGold = serverdata.status === 'GOLD';
    
    if (!hasPro && !hasGold) {
        theme = 'default'; // Zresetuj do domyślnego jeśli nie ma uprawnień
    }
}

// Walidacja danych administracji
if (administration) {
    if (typeof administration === 'string') {
        try {
            administration = JSON.parse(administration);
        } catch (e) {
            console.warn('[ADMINISTRATION] Błąd parsowania JSON:', e);
            return error(res, 'Wystąpił problem z odczytaniem danych administracji. Upewnij się, że poprawnie dodałeś osoby do zespołu.');
        }
    }

    if (!Array.isArray(administration)) {
        return error(res, 'Lista administracji musi zawierać poprawnie dodanych użytkowników.');
    }

    for (const [index, admin] of administration.entries()) {
        if (!admin || typeof admin !== 'object') {
            return error(res, `Wystąpił błąd przy przetwarzaniu administratora nr ${index + 1}.`);
        }

        if (!admin.userID || !/^\d{15,24}$/.test(admin.userID)) {
            return error(res, `Administrator nr ${index + 1} ma nieprawidłowe ID użytkownika. Upewnij się, że został poprawnie dodany.`);
        }


        if (admin.color && !/^[0-9A-Fa-f]{6}$/.test(admin.color)) {
            return error(res, `Administrator nr ${index + 1} ma nieprawidłowy kolor HEX. Wprowadź 6-cyfrowy kod, np. "FFAA00".`);
        }

        // Pobierz avatar użytkownika
        const botUser = await global.client.users.fetch(admin.userID);
        admin.avatar = botUser.displayAvatarURL({ format: 'png', size: 512 }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png'; // Domyślny avatar

        // Pobierz nickname użytkownika (jeśli jest dostępny)
        const nickname = botUser.nickname || botUser.username; // Jeśli brak nickname, użyj username
        admin.nickname = nickname;
    }
}




        // Trim and sanitize descriptions
        longDesc = sanitizeHtml(longDesc?.trim() || '', {
            allowedTags: sanitizeHtml.defaults.allowedTags,
            allowedAttributes: {}
        });
        shortDesc = sanitizeHtml(shortDesc?.trim() || '', {
            allowedTags: sanitizeHtml.defaults.allowedTags,
            allowedAttributes: {}
        });

        if (!validateDescription(shortDesc, 50, 200)) {
            return error(res, 'Krótki opis musi mieć od 50 do 200 znaków.');
        }

        if (!validateDescription(longDesc, 200, 5000)) {
            return error(res, 'Długi opis musi mieć od 200 do 5000 znaków.');
        }

        await validateInviteURL(inviteURL);

        if (patroniteURL && !isValidURL(patroniteURL)) {
            return error(res, 'Link Patronite musi być prawidłowym URL.');
        }

        if (customBannerURL) {
            if (!isValidURL(customBannerURL) || !/\.(png|jpg|webp)$/i.test(customBannerURL)) {
                return error(res, 'Niestandardowy link do tła musi być prawidłowym URL wskazującym na obraz PNG, JPG lub WEBP.');
            }
        }


if (vanityURL) {
    // Usuwamy niedozwolone znaki
    const invalidCharacters = /[^\w\-]/; // Dozwolone: litery, cyfry, myślniki
    if (invalidCharacters.test(vanityURL)) {
        return error(res, 'Unikalny URL może zawierać tylko litery, cyfry i myślniki.');
    }

    // Lista zablokowanych słów (polskie przekleństwa i inne niedozwolone słowa)
    const blockedWords = [
        'admin', 'moderator', 'discord', 'help', 'bot', 'support', 'official',
        'kurwa', 'pizda', 'chuj', 'jebac', 'jebany', 'jebane', 'jebana', 'jebani',
        'skurwysyn', 'skurwiel', 'skurwiała', 'skurwysyny', 'kurwy', 'kurwisko',
        'debile', 'debil', 'idiota', 'idiotka', 'dupek', 'dupki', 'dupa', 'dupcia',
        'gowno', 'gówno', 'gówniarz', 'gówniara', 'gówniaki', 'gówniak',
        'zjeb', 'zjebany', 'zjeby', 'spierdalaj', 'wypierdalaj', 'pierdol', 'pierdolony',
        'chuje', 'chujowy', 'chujowa', 'chujowe', 'chujnia', 'huj', 'huje', 'hujowy',
        'cwel', 'cwela', 'cwele', 'pedal', 'pedał', 'pedały', 'ciota', 'cioty',
        'spierdoleniec', 'spierdolone', 'spierdolić', 'spierdolony',
        'szmata', 'szmaty', 'szmaciak', 'szmato', 'kutas', 'kutasy',
        'ruchać', 'ruchanie', 'wyruchany', 'przeruchać', 'przeruchane',
        'murzyn', 'mużyn', 'czarnuch', 'czarnuchy',
        'down', 'downy', 'mongol', 'mongoł',
        'hitler', 'nazista', 'faszysta', 'adolf',
        'jebacpis', 'jebacplatforme', 'p0lska', 'p0laczki', 'polaczki',
        'kurwidołek', 'kurwidołki', 'chlew', 'burdel', 'dziwka', 'dziwki',
        'szambo', 'obsrany', 'rozjebany', 'rozpierdol', 'wykurwiony',
        'discordzik', 'discordzikpl', 'wlasciciel', 'właściciel', 'famemma',
        'sklep', 'pomoc', 'cwelisko', 'cweluch', 'cwelek', 'szczyl', 'szczeniak'
    ];

    // Usuwamy myślniki i inne znaki, aby wykrywać np. "nicekurwa", "n1c3kurwa"
    const cleanedURL = vanityURL.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Sprawdzamy, czy zawiera zakazane słowa
    for (let word of blockedWords) {
        const regex = new RegExp(word.replace(/\*/g, '.'), 'gi'); // Obsługa zamienników (* -> dowolny znak)
        if (regex.test(cleanedURL)) {
            return error(res, `Unikalny URL nie może zawierać słowa: ${word}.`);
        }
    }
}

// Zabezpieczenie: tylko PRO lub GOLD może zapisać customBannerURL
const hasProOrGold = serverdata.status === 'PRO' || serverdata.status === 'GOLD';
if (!hasProOrGold) {
    customBannerURL = undefined;
}


        // Update server data in the database
        await serversdata.findOneAndUpdate(
            { serverID: req.params.id },
            {
                $set: {
                    inviteURL,
                    vanityURL,  // Update vanity URL
                    patroniteURL,
                    stronaURL,
                    tags,
					theme,
                    shortDesc,
                    longDesc,
                    customBannerURL,
					administration: administration || serverdata.administration || []
                }
            },
            { upsert: true }
        );

        res.json({
            error: false,
            message: `Pomyślnie edytowałeś swój serwer. <a href='/server/${req.params.id}' class="btn btn-success">Zobacz stronę</a>`
        });

        let guildCache = global.serverClient.guilds.cache.get(req.params.id);

        global.client.channels.cache.get(global.config.server.channels.zmiany).send({
            content: `<@${req.user.id}> zedytował ${guildCache?.name || req.params.id}\n<${global.config.website.url}/server/${req.params.id}>`,
            allowedMentions: { users: [req.user.id], roles: [] }
        });

    } catch (e) {
        console.error('Wystąpił błąd:', e);
        error(res, 'Wystąpił nieoczekiwany błąd. Administratorzy zostali powiadomieni.');
    }
});

module.exports = app;
