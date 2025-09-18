const express = require("express");
const moment = require("moment-timezone"); // Only this one is needed
require('moment/locale/pl');
moment.locale('pl');
moment.tz.setDefault('Europe/Warsaw'); // Add this line to set default timezone

const serversdata = require("../../database/models/servers/server.js");
const redis = global.redis;
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const app = express.Router();

// Include shop routes
const shopRoutes = require('./shop');
app.use('/', shopRoutes);


const BAD_WORDS = [
  'kurwa', 'chuj', 'pierdol', 'jebać', 'jebac', 'pierdole', 'pizda', 
  'huj', 'cipa', 'sukinsyn', 'skurwysyn', 'debil', 'idiota', 
  // dodaj więcej słów według potrzeb
];


function containsBadWords(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return BAD_WORDS.some(word => lowerText.includes(word));
}

async function shouldCountView(serverId) {
    const key = `server_views:${serverId}`;
    
    // Zwiększamy licznik i pobieramy aktualną wartość
    const currentCount = await redis.incr(key);
    
    // Jeśli to pierwsze zwiększenie, ustawiamy czas wygaśnięcia
    if (currentCount === 1) {
        await redis.expire(key, 3600); // 1 godzina
    }
    
    // Zwracamy true tylko jeśli nie przekroczono limitu
    return currentCount <= 50;
}


async function refreshAdminAvatars(serverId) {
    try {
        const server = await serversdata.findOne({ serverID: serverId });
        if (!server || !server.administration || server.administration.length === 0) {
            return;
        }

        let needsUpdate = false;
        const cacheKey = `admin_avatars:${serverId}`;
        
        // Sprawdź czy mamy dane w cache
        const cachedAvatars = await redis.get(cacheKey);
        const lastUpdated = cachedAvatars ? JSON.parse(cachedAvatars).lastUpdated : null;
        
        // Jeśli dane są starsze niż 5 dni, odśwież
        if (!lastUpdated || (Date.now() - lastUpdated) > 5 * 24 * 60 * 60 * 1000) {
            for (const admin of server.administration) {
                try {
                    const user = await global.client.users.fetch(admin.userID);
                    const newAvatar = user.displayAvatarURL({ format: 'png', size: 512 }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const newNickname = user.nickname || user.username;
                    
                    if (admin.avatar !== newAvatar || admin.nickname !== newNickname) {
                        admin.avatar = newAvatar;
                        admin.nickname = newNickname;
                        needsUpdate = true;
                    }
                } catch (error) {
                    console.error(`Error refreshing avatar for admin ${admin.userID}:`, error);
                    // Jeśli nie można pobrać użytkownika, ustaw domyślny avatar
                    if (admin.avatar !== 'https://cdn.discordapp.com/embed/avatars/0.png') {
                        admin.avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
                        needsUpdate = true;
                    }
                }
            }
            
            if (needsUpdate) {
                await serversdata.updateOne(
                    { serverID: serverId },
                    { $set: { administration: server.administration } }
                );
            }
            
            // Zaktualizuj cache
            await redis.set(cacheKey, JSON.stringify({
                lastUpdated: Date.now(),
                avatars: server.administration.map(a => ({ userID: a.userID, avatar: a.avatar }))
            }), 'EX', 10 * 24 * 60 * 60); // Cache na 10 dni
        }
    } catch (error) {
        console.error(`Error refreshing admin avatars for server ${serverId}:`, error);
    }
}

async function cleanupAvatarCache() {
    try {
        // Pobierz wszystkie klucze cache
        const keys = await redis.keys('admin_avatars:*');
        
        for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
                const parsed = JSON.parse(data);
                // Jeśli dane są starsze niż 15 dni, usuń
                if ((Date.now() - parsed.lastUpdated) > 15 * 24 * 60 * 60 * 1000) {
                    await redis.del(key);
                }
            }
        }
    } catch (err) {
        console.error('Error cleaning up avatar cache:', err);
    }
}

// Uruchom czyszczenie co 24 godziny
setInterval(cleanupAvatarCache, 24 * 60 * 60 * 1000);
cleanupAvatarCache(); // Uruchom też przy starcie

// Dodaj tę funkcję na początku pliku, np. po imporcie modułów
async function cleanupOldEvents() {
  try {
    const oneWeekAgo = moment().subtract(1, 'week').toDate();
    
    const servers = await serversdata.find({
      'events.endDate': { $lt: oneWeekAgo }
    });
    
    for (const server of servers) {
      const originalEventCount = server.events.length;
      server.events = server.events.filter(event => 
        new Date(event.endDate) > oneWeekAgo
      );
      
      if (server.events.length !== originalEventCount) {
        await server.save();
        console.log(`Usunięto ${originalEventCount - server.events.length} starych wydarzeń z serwera ${server.serverID}`);
      }
    }
  } catch (err) {
    console.error('Błąd podczas czyszczenia starych wydarzeń:', err);
  }
}

// Uruchom czyszczenie co 24 godziny
setInterval(cleanupOldEvents, 24 * 60 * 60 * 1000);

// Uruchom też przy starcie serwera
cleanupOldEvents();

// Konfiguracja limitów zapytań
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Zbyt wiele żądań z tego adresu IP. Spróbuj ponownie za 15 minut.',
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Zbyt wiele wrażliwych operacji z tego adresu IP. Spróbuj ponownie później',
});

// Funkcje pomocnicze
const validateServerIds = (ids) => {
  if (!ids || !Array.isArray(ids)) return false;
  return ids.every(id => /^\d{17,19}$/.test(id)) && ids.length <= 50;
};

const authenticateApiRequest = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid API key' 
    });
  }
  
  next();
};

const render404 = (req, res, message) => {
  res.status(404).render("404.ejs", {
    bot: global.client || null,
    sbot: global.serverClient,
    path: req.path,
    user: req.isAuthenticated() ? req.user : null,
    req,
    message
  });
};

// API Endpoints
app.get('/api/servers/info', apiLimiter, authenticateApiRequest, async (req, res) => {
  try {
    if (!req.query.ids) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing ids parameter' 
      });
    }

    const serverIds = req.query.ids.split(',');
    
    if (!validateServerIds(serverIds)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nieprawidłowy format identyfikatorów serwera' 
      });
    }
    
const serversInfo = {};

for (const id of serverIds) {
  const cacheKey = `server_info:${id}`;
  let cached = await redis.get(cacheKey);

  if (cached) {
    serversInfo[id] = JSON.parse(cached);
    continue;
  }

  try {
    const guild = global.serverClient.guilds.cache.get(id);
    if (guild) {
      const data = {
        memberCount: guild.memberCount,
        icon: guild.iconURL({ format: 'webp', size: 256, dynamic: true }) ||
              'https://cdn.discordapp.com/embed/avatars/0.png'
      };
      serversInfo[id] = data;

      // Zapisz do Redis na 10 minut
      await redis.set(cacheKey, JSON.stringify(data), 'EX', 600);
    } else {
      serversInfo[id] = null;
    }
  } catch (error) {
    console.error(`Error fetching info for guild ${id}:`, error);
    serversInfo[id] = null;
  }
}

    
    res.json({ success: true, servers: serversInfo });
  } catch (error) {
    console.error('Error in server info endpoint:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// Server routes
app.get('/server/:identifier', async (req, res) => {
    const { identifier } = req.params;

    try {
        let serverdata = await serversdata.findOne({
            $or: [{ serverID: identifier }, { vanityURL: identifier }]
        });

        if (!serverdata) return render404(req, res, "Wygląda na to, że serwer którego szukasz, został pożarty przez dzika.");
		
        // Sprawdzamy czy można doliczyć wyświetlenie
        if (await shouldCountView(serverdata.serverID)) {
            await serversdata.updateOne(
                { $or: [{ serverID: identifier }, { vanityURL: identifier }] },
                { $inc: { 'analytics.views': 1 } }
            );
            
            // Odświeżamy dane tylko jeśli licznik został zwiększony
            serverdata = await serversdata.findOne({
                $or: [{ serverID: identifier }, { vanityURL: identifier }]
            });
        }

        // Check cache for server info
        const cacheKey = `server_info:${serverdata.serverID}`;
        let serverInfo;
        try {
            serverInfo = await redis.get(cacheKey);
            if (serverInfo) {
                console.log(`Cache hit for ${cacheKey}`);
                serverInfo = JSON.parse(serverInfo);
            } else {
                console.log(`Cache miss for ${cacheKey}`);
                const guild = global.serverClient ? global.serverClient.guilds.cache.get(serverdata.serverID) : null;
                serverInfo = {
                    memberCount: guild ? guild.memberCount : null,
                    icon: guild ? guild.iconURL({ format: 'webp', size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png' : null,
                    name: serverdata.name,
                };
                try {
                    await redis.set(cacheKey, JSON.stringify(serverInfo), 'EX', 600);
                } catch (err) {
                    console.error(`Redis set error for ${cacheKey}:`, err);
                }
            }
        } catch (err) {
            console.error(`Redis error for ${cacheKey}:`, err);
            const guild = global.serverClient ? global.serverClient.guilds.cache.get(serverdata.serverID) : null;
            serverInfo = {
                memberCount: guild ? guild.memberCount : null,
                icon: guild ? guild.iconURL({ format: 'webp', size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png' : null,
                name: serverdata.name,
            };
        }

        // Validate server access
        if (!global.serverClient.guilds.cache.get(serverdata.serverID) && req.user?.id !== serverdata.ownerID) {
            return render404(req, res, "Wygląda na to, że serwer którego szukasz, został pożarty przez dzika.");
        }

        let owner = {
            id: serverdata.ownerID,
            username: "Unknown",
            avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
        };

        try {
            let fetchedOwner = await global.client.users.fetch(serverdata.ownerID);
            if (fetchedOwner) {
                owner.username = fetchedOwner.tag;
                owner.avatar = fetchedOwner.displayAvatarURL({ dynamic: true, size: 128 });
            }
        } catch (err) {
            console.error("Failed to fetch server owner:", err);
        }

        let rateAuthors = await Promise.all(
            serverdata.rates.map(async (rate) => {
                try {
                    let rateAuthor = await global.client.users.fetch(rate.author);
                    return rateAuthor || {
                        id: "0000000000",
                        username: "Unknown",
                        discriminator: "0000",
                        avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
                    };
                } catch (e) {
                    return {
                        id: "0000000000",
                        username: "Unknown",
                        discriminator: "0000",
                        avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
                    };
                }
            })
        );

        if (!serverdata.inviteURL) {
            try {
                let invite = await global.serverClient.channels.cache
                    .get(serverdata.channels[0])
                    ?.createInvite({ maxAge: 0, maxUses: 0 });

                if (invite) {
                    await serversdata.updateOne(
                        { serverID: serverdata.serverID },
                        { $set: { inviteURL: invite.url } }
                    );
                    serverdata.inviteURL = invite.url;
                }
            } catch (e) {
                console.error("Error creating invite:", e);
            }
        }

        res.render('servers/server', {
            bot: global.client || null,
            sbot: global.serverClient,
            path: req.path,
            rateAuthors,
            user: req.isAuthenticated() ? req.user : null,
            req,
            serverdata: {
                ...serverdata._doc,
                memberCount: serverInfo.memberCount,
                icon: serverInfo.icon,
                name: serverInfo.name || serverdata.name,
            },
            moment,
            owner
        });
    } catch (err) {
        console.error(`Error in /server/:identifier route: ${err}`);
        render404(req, res, "An error occurred while fetching the server data.");
    }
});


// Wyświetlanie strony wydarzenia
// Wyświetlanie strony wydarzenia - poprawiona wersja
app.get('/server/:serverID/events/:eventID', async (req, res) => {
    const { serverID, eventID } = req.params;

    try {
        // Pobieramy dane serwera (zarówno przez serverID, jak i vanityURL)
        const serverdata = await serversdata.findOne({
            $or: [{ serverID: serverID }, { vanityURL: serverID }]
        }).lean();

        if (!serverdata) {
            return render404(req, res, 'Serwer nie został znaleziony');
        }

        // Sprawdzenie czy serwer istnieje na Discordzie
        if (!global.serverClient?.guilds.cache.get(serverdata.serverID) && req.user?.id !== serverdata.ownerID) {
            return render404(req, res, 'Serwer nie istnieje na Discordzie');
        }


        // Szukamy wydarzenia po ID w tablicy events
        const event = serverdata.events.find(e => e.id === eventID);
        if (!event) {
            return render404(req, res, 'Wydarzenie nie zostało znalezione');
        }
		
        const now = new Date();
        const eventEnd = new Date(event.endDate);
        event.isEnded = eventEnd < now;
        event.isRecent = (now - eventEnd) < (7 * 24 * 60 * 60 * 1000); // Czy zakończone w ciągu 

        // Pobierz dane właściciela wydarzenia
        let eventCreator = { id: event.createdBy, username: 'Nieznany', avatar: null };
        try {
            const creator = await global.client?.users.fetch(event.createdBy);
            if (creator) {
                eventCreator.username = creator.username;
                eventCreator.avatar = creator.displayAvatarURL({ size: 128 });
            }
        } catch (err) {
            console.error('Błąd podczas pobierania twórcy wydarzenia:', err);
        }
		event.startDate = moment.tz(event.startDate, 'Europe/Warsaw').format();
event.endDate = moment.tz(event.endDate, 'Europe/Warsaw').format();

        // Renderowanie strony wydarzenia
        res.render('servers/event-page', {
            bot: global.client || null,
            sbot: global.serverClient || null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req,
            serverdata,
            event,
            eventCreator,
            moment,
            config: global.config || {}
        });
    } catch (err) {
        console.error('Błąd podczas pobierania wydarzenia:', err);
        render404(req, res, 'Wewnętrzny błąd serwera');
    }
});


// Display event form
app.get('/server/:identifier/event/new', strictLimiter, async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }

    const { identifier } = req.params;

    try {
        const serverdata = await serversdata.findOne({
            $or: [{ serverID: identifier }, { vanityURL: identifier }]
        });

        if (!serverdata) {
            return render404(req, res, "Serwer nie został znaleziony");
        }

        // Dodatkowe sprawdzenie czy użytkownik jest właścicielem lub ma uprawnienia
        if (serverdata.ownerID !== req.user.id) {
            return render404(req, res, "Musisz być właścicielem serwera, aby dodawać wydarzenia");
        }

        // Sprawdź czy bot jest na serwerze
        const guild = global.serverClient?.guilds.cache.get(serverdata.serverID);
        if (!guild && req.user?.id !== serverdata.ownerID) {
            return render404(req, res, "Bot nie jest na tym serwerze");
        }

        res.render('servers/event-form', {
            bot: global.client || null,
            sbot: global.serverClient,
            path: req.path,
            user: req.user,
            req,
            serverdata,
            moment
        });
    } catch (err) {
        console.error(`Błąd w ścieżce formularza wydarzenia: ${err}`);
        render404(req, res, "Wystąpił błąd podczas ładowania formularza");
    }
});

// Handle event submission
app.post('/server/:identifier/event/new', 
    strictLimiter,
    [
        body('name').trim()
            .isLength({ min: 5, max: 42 }).withMessage('Nazwa musi mieć od 5 do 42 znaków')
            .custom(value => !containsBadWords(value)).withMessage('Nazwa zawiera niedozwolone słowa')
            .escape(),
        body('description').trim()
            .isLength({ max: 100 }).withMessage('Opis może mieć maksymalnie 100 znaków')
            .custom(value => !containsBadWords(value)).withMessage('Opis zawiera niedozwolone słowa')
            .escape(),
        body('startDate').isISO8601().withMessage('Nieprawidłowy format daty rozpoczęcia')
            .custom((value, { req }) => {
                const startDate = new Date(value);
                const now = new Date();
                return startDate > now;
            }).withMessage('Data rozpoczęcia musi być w przyszłości'),
        body('endDate').isISO8601().withMessage('Nieprawidłowy format daty zakończenia')
            .custom((value, { req }) => {
                if (!req.body.startDate) return true;
                const startDate = new Date(req.body.startDate);
                const endDate = new Date(value);
                return endDate > startDate;
            }).withMessage('Data zakończenia musi być późniejsza niż data rozpoczęcia'),
        body('imageURL').optional({ checkFalsy: true })
            .isURL().withMessage('Nieprawidłowy URL obrazka')
            .trim(),
        body('endDate').custom((value, { req }) => {
            const endDate = new Date(value);
            const maxEndDate = new Date();
            maxEndDate.setDate(maxEndDate.getDate() + 30); // Maksymalnie 30 dni w przyszłość
            return endDate <= maxEndDate;
        }).withMessage('Wydarzenie nie może trwać dłużej niż 30 dni')
    ],
    async (req, res) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ success: false, error: "Nie jesteś zalogowany" });
        }



        const { identifier } = req.params;
        const { name, description, startDate, endDate, imageURL } = req.body;

        // Additional check for banned words (even if validation passed)
        if (containsBadWords(name) || containsBadWords(description)) {
            return res.status(400).json({ 
                success: false, 
                error: "Zawartość zawiera niedozwolone słowa"
            });
        }

        try {
            const serverdata = await serversdata.findOne({
                $or: [{ serverID: identifier }, { vanityURL: identifier }]
            });

            if (!serverdata) return res.status(404).json({ success: false, error: "Serwer nie został znaleziony" });
            if (serverdata.ownerID !== req.user.id) return res.status(403).json({ success: false, error: "Brak uprawnień" });

            // Check if server already has 4 active events
            const activeEvents = serverdata.events.filter(event => {
                const eventEndDate = new Date(event.endDate);
                return eventEndDate > new Date(); // Only count events that haven't ended yet
            });

            if (activeEvents.length >= 4) {
                return res.status(400).json({
                    success: false,
                    error: "Osiągnięto limit 4 aktywnych wydarzeń na serwerze. Usuń istniejące wydarzenie przed dodaniem nowego."
                });
            }

            const newEvent = {
                id: require('crypto').randomBytes(16).toString('hex'),
                name,
                description,
                startDate: moment.tz(startDate, 'Europe/Warsaw').toDate(),
                endDate: moment.tz(endDate, 'Europe/Warsaw').toDate(),
                imageURL: imageURL || null,
                createdBy: req.user.id,
                createdAt: new Date()
            };

            serverdata.events.push(newEvent);
            await serverdata.save();

            // Only log to Discord if there are no banned words
            if (!containsBadWords(name) && !containsBadWords(description)) {
                global.client.channels.cache.get(global.config.server.channels.events).send({
                    content: `\`📅\` Nowe wydarzenie na [Serwerze](https://discordzik.pl/server/${serverdata.serverID}) dodane przez ${req.user.id}:
\n\`🏷️\` Nazwa: ${name}
\n\`📝\` Opis: ${description}
\n\`⏱️\` Start: ${new Date(startDate).toLocaleString()}
\n\`⏳\` Koniec: ${new Date(endDate).toLocaleString()}`
                });
            }

            res.json({ 
                success: true,
                message: "Wydarzenie zostało pomyślnie dodane"
            });
        } catch (err) {
            console.error(`Błąd podczas tworzenia wydarzenia: ${err}`);
            res.status(500).json({ success: false, error: "Wewnętrzny błąd serwera" });
        }
    }
);


// Delete event
app.post('/server/:identifier/event/delete', 
    strictLimiter,
    [
        body('eventId').isString().trim().withMessage('Nieprawidłowy identyfikator wydarzenia').escape()
    ],
    async (req, res) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ success: false, error: "Nie jesteś zalogowany" });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                error: "Błąd walidacji",
                details: errors.array().map(err => err.msg)
            });
        }

        const { identifier } = req.params;
        const { eventId } = req.body;

        try {
            const serverdata = await serversdata.findOne({
                $or: [{ serverID: identifier }, { vanityURL: identifier }]
            });

            if (!serverdata) return res.status(404).json({ success: false, error: "Serwer nie został znaleziony" });
            if (serverdata.ownerID !== req.user.id) return res.status(403).json({ success: false, error: "Brak uprawnień" });

            const eventIndex = serverdata.events.findIndex(e => e.id === eventId);
            if (eventIndex === -1) return res.status(404).json({ success: false, error: "Wydarzenie nie zostało znalezione" });

            const deletedEvent = serverdata.events[eventIndex];
            
            serverdata.events.splice(eventIndex, 1);
            await serverdata.save();

            // Log event deletion to Discord channel
            global.client.channels.cache.get(global.config.server.channels.events).send({
                content: `\`🗑️\` Usunięto wydarzenie z [Serwera](https://discordzik.pl/server/${serverdata.serverID}) przez ${req.user.id}:
\n\`🏷️\` Nazwa: ${deletedEvent.name}
\n\`📝\` Opis: ${deletedEvent.description}
\n\`🆔\` ID wydarzenia: ${deletedEvent.id}`
            });

            res.json({ success: true });
        } catch (err) {
            console.error(`Błąd podczas usuwania wydarzenia: ${err}`);
            res.status(500).json({ success: false, error: "Wewnętrzny błąd serwera" });
        }
    }
);


app.get("/allservers", async (req, res) => {
  try {
    const itemsPerPage = 30; // Match what's displayed in template
    const page = Math.max(1, parseInt(req.query.page) || 1);
    
    // Get total count for pagination
    const totalCount = await serversdata.countDocuments({});
    const totalPages = Math.ceil(totalCount / itemsPerPage);

    // Get paginated servers
    const servers = await serversdata.find()
      .sort({ votes: -1, _id: 1 }) // Secondary sort for consistency
      .skip((page - 1) * itemsPerPage)
      .limit(itemsPerPage)
      .lean(); // For better performance

    // Get tags data (consider caching this)
    const tagCounts = await serversdata.aggregate([
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.render("servers/total_servers", {
      sbot: global.serverClient || null,
      path: req.path,
      user: req.isAuthenticated() ? req.user : null,
      req,
      page,
      totalPages,
      servers,
      tags: tagCounts,
      config: global.config || {}
    });
  } catch (err) {
    console.error(`Error in /allservers route: ${err}`);
    res.status(500).render("error", {
      message: "An error occurred while fetching servers.",
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  }
});

// Lista wszystkich wydarzeń
app.get('/wydarzenia', async (req, res) => {
    try {
        // Pobierz wszystkie serwery z aktywnymi wydarzeniami
        const now = new Date();
        const serversWithEvents = await serversdata.find({
            'events.endDate': { $gte: now }
        }).lean();

        // Zbierz wszystkie aktywne wydarzenia
        let allEvents = [];
        serversWithEvents.forEach(server => {
            server.events.forEach(event => {
                if (new Date(event.endDate) >= now) {
                    allEvents.push({
                        ...event,
                        serverId: server.serverID,
                        serverName: server.name,
                        serverVanityURL: server.vanityURL,
                        serverIcon: server.iconURL
                    });
                }
            });
        });

        // Sortuj wydarzenia według daty rozpoczęcia (najbliższe pierwsze)
        allEvents.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

        // Podziel na kategorie
        const upcomingEvents = allEvents.filter(event => new Date(event.startDate) > now);
        const ongoingEvents = allEvents.filter(event => 
            new Date(event.startDate) <= now && new Date(event.endDate) >= now
        );

        res.render('servers/events-list', {
            bot: global.client || null,
            sbot: global.serverClient,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req,
            upcomingEvents,
            ongoingEvents,
            moment,
            config: global.config || {}
        });
    } catch (err) {
        console.error('Błąd podczas pobierania wydarzeń:', err);
        render404(req, res, 'Wewnętrzny błąd serwera');
    }
});

module.exports = app;