const express = require('express');
const router = express.Router();
const serversdata = require("../database/models/servers/server.js");
const profilesdata = require("../database/models/profile.js");
const botsdata = require("../database/models/bots/bots.js");
const compression = require('compression');
router.use(compression());

// Quality thresholds (adjust these as needed)
const QUALITY_THRESHOLDS = {
  MIN_MEMBERS: 100,
  MIN_VOTES: 2,
  MIN_SHORT_DESC_LENGTH: 10,
  MIN_LONG_DESC_LENGTH: 10,
  MIN_TAGS: 1
};

// Enhanced quality filter function to exclude invalid servers
function meetsQualityStandards(server) {
  try {
    // Check for required fields and their validity
    const hasRequiredFields = 
      server.serverID && typeof server.serverID === 'string' && server.serverID.trim() !== '' &&
      server.shortDesc && typeof server.shortDesc === 'string' && server.shortDesc.trim().length >= QUALITY_THRESHOLDS.MIN_SHORT_DESC_LENGTH &&
      server.longDesc && typeof server.longDesc === 'string' && server.longDesc.trim().length >= QUALITY_THRESHOLDS.MIN_LONG_DESC_LENGTH &&
      server.tags && Array.isArray(server.tags) && server.tags.length >= QUALITY_THRESHOLDS.MIN_TAGS;

    // Additional checks for server validity
    const isValidServer = 
      hasRequiredFields &&
      (server.memberCount >= QUALITY_THRESHOLDS.MIN_MEMBERS || server.votes >= QUALITY_THRESHOLDS.MIN_VOTES);

    if (!hasRequiredFields) {
      console.log(`Skipping server ${server.serverID || 'unknown'}: Missing or invalid required fields`);
    } else if (!isValidServer) {
      console.log(`Skipping server ${server.serverID}: Does not meet quality thresholds`);
    }

    return isValidServer;
  } catch (e) {
    console.error('Quality check error for server:', server.serverID || 'unknown', e);
    return false; // Fail-safe
  }
}

// Add this to your sitemap_index.xml route
router.get('/sitemap_index.xml', async (req, res) => {
  res.header('Content-Type', 'application/xml');
  res.render('sitemaps/sitemap_index', {
    sitemaps: [
      { loc: 'https://discordzik.pl/sitemap-pages.xml' },
      { loc: 'https://discordzik.pl/sitemap-servers.xml' },
      { loc: 'https://discordzik.pl/sitemap-profiles.xml' },
      { loc: 'https://discordzik.pl/sitemap-bots.xml' },
      { loc: 'https://discordzik.pl/sitemap-tags.xml' },
	  { loc: 'https://discordzik.pl/sitemap-bot-tags.xml' }
    ],
    lastmod: new Date().toISOString()
  });
});

router.get('/sitemap-bot-tags.xml', async (req, res) => {
  try {
    // Pobierz wszystkie boty do zliczenia tagów
    const totalBots = await botsdata.find({});
    const total_tags = config.website.botTags; // Upewnij się, że config jest dostępny
    
    // Zlicz użycie tagów
    const tags = {};
    for (let bot of totalBots.filter(b => b.tags?.length)) {
      for (let tag of bot.tags) {
        tags[tag] = (tags[tag] || 0) + 1;
      }
    }

    // Utwórz wpisy sitemapy dla każdego tagu, który ma przynajmniej jednego bota
    const tagEntries = total_tags
      .filter(tag => tags[tag] > 0) // Tylko tagi, które są faktycznie używane
      .map(tag => ({
        url: `/bots/${encodeURIComponent(tag)}`,
        lastmod: new Date().toISOString().split('T')[0] // Tylko część daty
      }));

    res.header('Content-Type', 'application/xml');
    res.render('sitemaps/sitemap_bot_tags', {
      tags: tagEntries,
      lastmod: new Date().toISOString()
    });

  } catch (error) {
    console.error('Błąd sitemapy tagów botów:', error);
    res.header('Content-Type', 'application/xml');
    res.render('sitemaps/sitemap_bot_tags', {
      tags: [],
      lastmod: new Date().toISOString()
    });
  }
});

// Add this new route for tag sitemap
router.get('/sitemap-tags.xml', async (req, res) => {
  try {
    // Get all servers to count tags
    const totalservers = await serversdata.find({});
    const total_tags = config.website.serverTags; // Make sure config is available
    
    // Count tag usage
    const tags = {};
    for (let server of totalservers.filter(b => b.tags?.length)) {
      for (let tag of server.tags) {
        tags[tag] = (tags[tag] || 0) + 1;
      }
    }

    // Create sitemap entries for each tag that has at least one server
    const tagEntries = total_tags
      .filter(tag => tags[tag] > 0) // Only include tags that are actually used
      .map(tag => ({
        url: `/servers/${encodeURIComponent(tag)}`,
        lastmod: new Date().toISOString().split('T')[0] // Just the date part
      }));

    res.header('Content-Type', 'application/xml');
    res.render('sitemaps/sitemap_tags', {
      tags: tagEntries,
      lastmod: new Date().toISOString()
    });

  } catch (error) {
    console.error('Tag sitemap error:', error);
    res.header('Content-Type', 'application/xml');
    res.render('sitemaps/sitemap_tags', {
      tags: [],
      lastmod: new Date().toISOString()
    });
  }
});

router.get('/sitemap-bots.xml', async (req, res) => {
  try {
    const allBots = await botsdata.find({})
      .select('botID Date votes')
      .sort({ Date: -1 })
      .limit(50000)
      .lean();

    const safeBots = allBots.map(bot => ({
      botID: bot.botID || '',
      lastmod: bot.Date || new Date(),
      votes: bot.votes || 0
    }));

    console.log(`Znaleziono ${safeBots.length} botów do sitemapy`);

    res.header('Content-Type', 'application/xml');
    res.render('sitemaps/sitemap_bots', {
      bots: safeBots,
      lastmod: new Date().toISOString()
    });

  } catch (error) {
    console.error('Błąd generowania sitemapy botów:', error);
    res.header('Content-Type', 'application/xml');
    res.render('sitemaps/sitemap_bots', {
      bots: [],
      lastmod: new Date().toISOString()
    });
  }
});

router.get('/sitemap-profiles.xml', async (req, res) => {
  try {
    const profiles = await profilesdata.find({
      $or: [
        { biography: { $exists: true, $ne: "" } },
        { 'transactions.0': { $exists: true } },
        { points: { $gte: 10 } }
      ]
    })
    .select('userID updatedAt points')
    .sort({ updatedAt: -1 })
    .limit(50000)
    .lean();

    console.log(`Found ${profiles.length} profiles for sitemap`);

    res.header('Content-Type', 'application/xml');
    res.render('sitemaps/sitemap_profiles', {
      profiles: profiles,
      lastmod: new Date().toISOString()
    });

  } catch (error) {
    console.error('Profile sitemap error:', error);
    res.header('Content-Type', 'application/xml');
    res.render('sitemaps/sitemap_profiles', {
      profiles: [],
      lastmod: new Date().toISOString()
    });
  }
});

router.get('/sitemap-pages.xml', async (req, res) => {
  const staticPages = [
    { url: '/', lastmod: '2025-05-15' },
    { url: '/servers', lastmod: '2025-05-15' },
    { url: '/bots', lastmod: '2025-05-15' },
    { url: '/wydarzenia', lastmod: '2025-05-15' },
    { url: '/partnerzy', lastmod: '2025-05-15' },
    { url: '/boost', lastmod: '2025-05-15' },
    { url: '/tos', lastmod: '2025-05-15' },
    { url: '/privacy', lastmod: '2025-05-15' },
    { url: '/cookies', lastmod: '2025-05-15' },
	{ url: '/tools', lastmod: '2025-08-23' }
  ];

  res.header('Content-Type', 'application/xml');
  res.render('sitemaps/sitemap_pages', { 
    pages: staticPages,
    lastmod: new Date().toISOString()
  });
});

// Dynamic server sitemap with enhanced filtering
router.get('/sitemap-servers.xml', async (req, res) => {
  try {
    // 1. Fetch all servers with minimal fields
    const allServers = await serversdata.find({})
      .select('serverID updatedAt createdAt votes memberCount shortDesc longDesc tags')
      .sort({ updatedAt: -1 })
      .limit(50000)
      .lean();

    // 2. Filter servers using enhanced quality standards
    const qualityServers = allServers.filter(meetsQualityStandards);

    console.log(`Sitemap stats: ${qualityServers.length} quality servers out of ${allServers.length} total`);

    // 3. If no quality servers, fall back to a limited set
    const finalServers = qualityServers.length > 0 
      ? qualityServers 
      : allServers.filter(server => 
          server.serverID && 
          server.shortDesc && 
          server.longDesc && 
          server.tags && Array.isArray(server.tags)
        ).slice(0, 100); // Fallback to 100 servers with basic validation

    res.header('Content-Type', 'application/xml');
    res.render('sitemaps/sitemap_servers', {
      servers: finalServers,
      lastmod: new Date().toISOString()
    });

  } catch (error) {
    console.error('Sitemap generation error:', error);
    // Fallback: return valid empty sitemap
    res.header('Content-Type', 'application/xml');
    res.render('sitemaps/sitemap_servers', {
      servers: [],
      lastmod: new Date().toISOString()
    });
  }
});

module.exports = router;