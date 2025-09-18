
const express = require('express');
const serversdata = require('../../database/models/servers/server');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Rate limiting - maksymalnie 10 żądań na minutę z jednego IP
const randomServerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuta
  max: 10, // maksymalnie 10 żądań na IP na minutę
  message: {
    success: false,
    message: 'Zbyt wiele żądań losowego serwera. Spróbuj ponownie za minutę.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

// Strict CORS policy - tylko dla obecnej domeny
const corsMiddleware = (req, res, next) => {
  const allowedOrigins = [
    'https://discordzik.pl',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
  ];
  
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  
  // Sprawdź origin lub referer
  const isAllowed = allowedOrigins.some(allowed => 
    origin === allowed || (referer && referer.startsWith(allowed))
  );
  
  if (!isAllowed && process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      message: 'Dostęp zabroniony - nieprawidłowa domena'
    });
  }
  
  res.setHeader('Access-Control-Allow-Origin', origin || 'https://discordzik.pl');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  
  next();
};

// Endpoint dla randomowego serwera
router.get('/random-server', corsMiddleware, randomServerLimiter, async (req, res) => {
  try {
    // Pobierz tylko serwery które nie mają tagu NSFW oraz mają podstawowe dane
    const servers = await serversdata.find({
      tags: { $ne: 'NSFW' }, // Wyklucz serwery z tagiem NSFW
      shortDesc: { $exists: true, $ne: '' }, // Musi mieć opis
      serverID: { $exists: true }
    }).select('serverID name shortDesc tags').lean();
    
    if (!servers || servers.length === 0) {
      return res.json({ 
        success: false, 
        message: 'Brak dostępnych serwerów' 
      });
    }

    // Najpierw wylosuj serwer, potem sprawdź Discord (szybsze)
    const randomIndex = Math.floor(Math.random() * servers.length);
    const randomServer = servers[randomIndex];

    // Sprawdź czy serwer istnieje na Discordzie
    const guild = global.serverClient?.guilds.cache.get(randomServer.serverID);
    
    // Jeśli wylosowany serwer nie istnieje lub ma mało członków, spróbuj ponownie
    if (!guild || guild.memberCount <= 10) {
      // Filtruj tylko serwery które rzeczywiście istnieją
      const validServers = servers.filter(server => {
        const serverGuild = global.serverClient?.guilds.cache.get(server.serverID);
        return serverGuild && serverGuild.memberCount > 10;
      });

      if (validServers.length === 0) {
        return res.json({ 
          success: false, 
          message: 'Brak dostępnych serwerów' 
        });
      }

      // Wylosuj ponownie z przefiltrowanej listy
      const validRandomIndex = Math.floor(Math.random() * validServers.length);
      const validRandomServer = validServers[validRandomIndex];
      const validGuild = global.serverClient.guilds.cache.get(validRandomServer.serverID);

      return res.json({
        success: true,
        server: {
          serverID: validRandomServer.serverID,
          name: validGuild?.name || validRandomServer.name,
          memberCount: validGuild?.memberCount || 0,
          icon: validGuild?.iconURL({ size: 256 }) || null,
          shortDesc: validRandomServer.shortDesc
        }
      });
    }
    
    res.json({
      success: true,
      server: {
        serverID: randomServer.serverID,
        name: guild?.name || randomServer.name,
        memberCount: guild?.memberCount || 0,
        icon: guild?.iconURL({ size: 256 }) || null,
        shortDesc: randomServer.shortDesc
      }
    });

  } catch (error) {
    console.error('Błąd podczas pobierania randomowego serwera:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Wewnętrzny błąd serwera' 
    });
  }
});

module.exports = router;
