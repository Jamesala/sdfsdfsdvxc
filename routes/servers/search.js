const express = require('express');
const app = express.Router();
const serversdata = require("../../database/models/servers/server.js");
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');
const { body, validationResult } = require('express-validator');
const slowDown = require('express-slow-down');


// Konfiguracja rate limiting
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per windowMs
  message: 'Zbyt wiele zapytań wyszukiwania. Spróbuj ponownie za minutę.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Konfiguracja spowolnienia po przekroczeniu limitu
const speedLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 5, // limit each IP to 5 requests per 10 seconds
  message: 'Zwolnij! Zbyt szybkie zapytania.',
  standardHeaders: true,
  legacyHeaders: false,
});


// Strict CORS policy
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://discordzik.pl');
  next();
});

// Funkcje pomocnicze
const escapeRegex = (text) => {
  if (typeof text !== 'string') return '';
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};

const sanitizeInput = (input) => {
  if (!input || typeof input !== 'string') return '';
  return input.trim().replace(/[<>\"']/g, '');
};

// Walidacja danych wejściowych
const validateSearchInput = [
  body('query')
    .trim()
    .escape()
    .isLength({ min: 2, max: 50 })
    .withMessage('Zapytanie musi mieć od 2 do 50 znaków')
    .matches(/^[a-zA-Z0-9\sąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+$/)
    .withMessage('Dozwolone tylko litery, cyfry i spacje')
];

// Route for tag search with pagination
app.get("/servers/:tag", async (req, res, next) => {
  try {
    // Walidacja parametru tagu
    const tag = sanitizeInput(req.params.tag);
    if (!tag || tag.length < 2 || tag.length > 20) {
      return res.status(400).render('error', {
        error: 'Nieprawidłowy tag serwera'
      });
    }

    let tags = {};
    let totalservers = await serversdata.find({}).lean();
    let total_tags = global.config.website.serverTags;
    
    // Bezpieczne przetwarzanie tagów
    for (let server of totalservers.filter(b => b.tags?.length)) {
      for (let serverTag of server.tags) {
        const cleanTag = sanitizeInput(serverTag);
        if (cleanTag && total_tags.includes(cleanTag)) {
          tags[cleanTag] = (tags[cleanTag] || 0) + 1;
        }
      }
    }

    let tag_count = total_tags.map(tagName => ({
      tag: tagName,
      count: tags[tagName] || 0
    }));

    let page = Number(req.query.page) || 1;
    if (isNaN(page) || page < 1) page = 1;
    
    // Get all servers with this tag
    const allServers = await serversdata.find({ 
      tags: { $in: [tag] }
    }).lean();

    // Filter servers that exist in Discord and have valid names
    const validServers = allServers.filter(server => {
      const guild = global.serverClient?.guilds.cache.get(server.serverID);
      const serverName = guild?.name || server.name || 'Nieznana nazwa';
      return serverName !== 'Nieznana nazwa';
    });

    // Shuffle valid servers randomly
    const shuffledServers = validServers.sort(() => Math.random() - 0.5);
    
    // Paginate the shuffled results (8 per page)
    const itemsPerPage = 8;
    const startIdx = (page - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const servers = shuffledServers.slice(startIdx, endIdx);

    const totalPages = Math.ceil(validServers.length / itemsPerPage);

    // Redirect to last page if page number is too high
    if (page > totalPages && totalPages > 0) {
      return res.redirect(`/servers/${encodeURIComponent(tag)}?page=${totalPages}`);
    }

    // Sanityzacja danych przed renderowaniem
    const safeServers = servers.map(server => ({
      ...server,
      name: sanitizeInput(server.name),
      shortDesc: sanitizeInput(server.shortDesc),
      tags: server.tags.map(t => sanitizeInput(t))
    }));

    res.render("servers/search", {
      bot: global.client || null,
      sbot: global.serverClient || null,
      path: req.path,
      user: req.isAuthenticated() ? req.user : null,
      req: req,
      page: page,
      servers: safeServers,
      tag: tag,
      tags: tag_count.sort((a, b) => b.count - a.count),
      totalPages: totalPages,
      totalServers: validServers.length
    });
  } catch (e) {
    console.error('Tag search error:', e);
    return res.status(500).render('error', {
      error: 'Wystąpił błąd podczas ładowania strony'
    });
  }
});

// Unified search endpoint
app.post("/servers/find", 
  searchLimiter,
  speedLimiter,
  async (req, res, next) => {
    try {
      const query = sanitizeInput(req.body.query);
      const filters = req.body.filters || {};

      // Allow search with just filters if no query
      if ((!query || query.length < 2) && (!filters.tags || filters.tags.length === 0)) {
        return res.status(400).json({ 
          error: true,
          message: 'Wpisz co najmniej 2 znaki lub wybierz tagi'
        });
      }

      // Build search query with filters
      let searchConditions = [];
      
      if (query && query.length >= 2) {
        searchConditions.push(
          { name: { $regex: escapeRegex(query), $options: 'i' } },
          { serverID: query },
          { tags: { $in: [new RegExp(escapeRegex(query), 'i')] } }
        );
      }

      // Add tag filters
      if (filters.tags && filters.tags.length > 0) {
        searchConditions.push({
          tags: { $in: filters.tags }
        });
      }

      const finalQuery = searchConditions.length > 0 ? { $or: searchConditions } : {};

      // Wyszukiwanie w bazie danych z ograniczeniami
      const dbResults = await serversdata.find(finalQuery)
        .limit(50) // Zwiększamy limit dla filtrowania
        .lean();

      // Wyszukiwanie w cache Discord z ograniczeniami
      let discordResults = [];
      if (global.serverClient) {
        discordResults = Array.from(global.serverClient.guilds.cache.values())
          .filter(g => {
            const guildName = g.name?.toLowerCase() || '';
            return guildName.includes(query.toLowerCase()) || 
                   g.id === query;
          })
          .slice(0, 20) // Limit wyników
          .map(g => ({
            serverID: g.id,
            name: g.name,
            icon: g.iconURL({ dynamic: true, size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png'
          }));
      }

      // Combine and process results
      const combinedIds = new Set([
        ...dbResults.map(s => s.serverID),
        ...discordResults.map(s => s.serverID)
      ]);

      const processedResults = await Promise.all(
        Array.from(combinedIds).slice(0, 15).map(async id => {
          const guild = global.serverClient?.guilds.cache.get(id);
          const dbData = await serversdata.findOne({ serverID: id }).lean() || {};

          const serverName = sanitizeInput(guild?.name) || sanitizeInput(dbData.name) || "Nieznana nazwa";

          return {
            serverID: id,
            name: serverName,
            icon: guild?.iconURL({ dynamic: true, size: 256 }) || dbData.icon || 'https://cdn.discordapp.com/embed/avatars/0.png',
            shortDesc: sanitizeInput(dbData.shortDesc) || 'Brak opisu',
            tags: (dbData.tags || []).map(t => sanitizeInput(t)),
            votes: dbData.votes || 0,
            status: dbData.status || 'FREE'
          };
        })
      );

      // Filter out servers with "Nieznana nazwa" and apply member count filters
      let validResults = processedResults.filter(server => 
        server && server.name && server.name !== "Nieznana nazwa"
      );

      // Apply member count filter
      if (filters.members) {
        validResults = validResults.filter(server => {
          const guild = global.serverClient?.guilds.cache.get(server.serverID);
          const memberCount = guild?.memberCount || 0;
          
          switch (filters.members) {
            case 'small':
              return memberCount >= 1 && memberCount <= 100;
            case 'medium':
              return memberCount > 100 && memberCount <= 500;
            case 'large':
              return memberCount > 500 && memberCount <= 1000;
            case 'huge':
              return memberCount > 1000;
            default:
              return true;
          }
        });
      }

      // Usuwanie duplikatów
      const uniqueResults = validResults.reduce((acc, current) => {
        if (!current || !current.serverID) return acc;
        
        const existing = acc.find(item => item.serverID === current.serverID);
        if (!existing) {
          acc.push(current);
        }
        return acc;
      }, []);

      // Sortowanie wyników według filtrów
      uniqueResults.sort((a, b) => {
        const aIsPromoted = ['BASIC', 'PRO', 'GOLD'].includes(a.status);
        const bIsPromoted = ['BASIC', 'PRO', 'GOLD'].includes(b.status);

        // Promowane zawsze na górze
        if (aIsPromoted && !bIsPromoted) return -1;
        if (!aIsPromoted && bIsPromoted) return 1;

        // Sortowanie według wybranego filtru
        switch (filters.sort) {
          case 'members':
            const aGuild = global.serverClient?.guilds.cache.get(a.serverID);
            const bGuild = global.serverClient?.guilds.cache.get(b.serverID);
            const aMemberCount = aGuild?.memberCount || 0;
            const bMemberCount = bGuild?.memberCount || 0;
            return bMemberCount - aMemberCount;
          
          case 'newest':
            const aDate = new Date(a.Date || 0);
            const bDate = new Date(b.Date || 0);
            return bDate - aDate;
          
          case 'oldest':
            const aDateOld = new Date(a.Date || 0);
            const bDateOld = new Date(b.Date || 0);
            return aDateOld - bDateOld;
          
          case 'name':
            return (a.name || "").localeCompare(b.name || "");
          
          case 'votes':
          default:
            return (b.votes || 0) - (a.votes || 0);
        }
      });

      res.json({
        error: false,
        servers: uniqueResults,
        count: uniqueResults.length
      });

    } catch (e) {
      console.error('Search error:', e);
      return res.status(500).json({
        error: true,
        message: 'Wystąpił błąd podczas wyszukiwania'
      });
    }
  }
);

// Obsługa błędów
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: true, message: 'Nieprawidłowy format JSON' });
  }
  res.status(500).json({ error: true, message: 'Wewnętrzny błąd serwera' });
});

module.exports = app;