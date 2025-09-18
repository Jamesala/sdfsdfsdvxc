const express = require('express');
const router = express.Router();
const serversdata = require("../../database/models/servers/server.js");
const botsdata = require("../../database/models/bots/bots.js");

console.success("[Servers] /servers/comment.js router loaded.".brightYellow);




// Pobranie komentarzy
router.get("/dashboard/comments", async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            return res.render("404", {
                bot: global.client || null,
                path: req.path,
                user: null,
                req: req,
                message: "Musisz być zalogowany, aby przeglądać komentarze."
            });
        }

        // Sprawdź czy użytkownik ma uprawnienia
        const guild = global.client.guilds.cache.get(config.server.id);
        if (!guild) {
            throw new Error("Guild not found");
        }

        const member = await guild.members.fetch(req.user.id).catch(() => null);
        if (!member) {
            return res.render("404", {
                bot: global.client || null,
                path: req.path,
                user: req.user,
                req: req,
                message: "Nie jesteś członkiem serwera Discord."
            });
        }

        const hasAccess = config.client.owners.includes(req.user.id) || 
                         member.roles.cache.has(config.server.roles.botReviewer);
        
        if (!hasAccess) {
            return res.render("404", {
                bot: global.client || null,
                path: req.path,
                user: req.user,
                req: req,
                message: "Nie masz dostępu do tej strony."
            });
        }

        // Pobierz ID serwera lub bota z query string (jeśli jest)
        const serverID = req.query.serverID || null;
        const botID = req.query.botID || null;

        let serverQuery = {};
        let botQuery = {};
        
        if (serverID) {
            serverQuery.serverID = serverID;
        }
        
        if (botID) {
            botQuery.botID = botID;
        }

        // Pobierz serwery i boty wraz z ich komentarzami
        const servers = await serversdata.find(serverQuery).lean();
        const bots = await botsdata.find(botQuery).lean();

// Fetch guild details from Discord's cache
await global.client.guilds.fetch(); // Refresh cache

const serverComments = servers.map(server => {
    const discordGuild = global.client.guilds.cache.get(server.serverID);
    return {
        type: 'server',
        serverID: server.serverID,
        serverName: discordGuild?.name || 'Unknown Server',
        serverIcon: discordGuild?.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png',
        comments: (server.rates || [])
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(comment => ({
                ...comment,
                date: new Date(comment.date).toISOString()
            }))
    };
});

const botComments = bots.map(bot => {
    return {
        type: 'bot',
        botID: bot.botID,
        botName: bot.username || 'Unknown Bot',
        botIcon: bot.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png',
        comments: (bot.rates || [])
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(comment => ({
                ...comment,
                date: new Date(comment.date).toISOString()
            }))
    };
});

const comments = [...serverComments, ...botComments];

        res.render("dashboard/comments", {
            bot: global.client || null,
            path: req.path,
            user: req.user,
            req: req,
            comments: comments,
            sbot: global.client // Używamy głównego bota jako sbot
        });
    } catch (e) {
        console.error("[Comments Route Error]", e);
        return res.render("500", {
            bot: global.client || null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Wystąpił błąd serwera podczas przetwarzania żądania."
        });
    }
});

router.get("/servers/comment/delete", async (req, res) => {
  try {
    const { commentId, serverID } = req.query;

    if (!req.isAuthenticated() || !req.user) {
      return res.render("404", {
        bot: global.client || null,
        path: req.path,
        user: null,
        req,
        message: "Musisz być zalogowany, aby usunąć komentarz."
      });
    }

    // Uprawnienia
    const guild = global.client.guilds.cache.get(config.server.id);
    if (!guild) throw new Error("Guild not found");

    const member = await guild.members.fetch(req.user.id).catch(() => null);
    const isOwner = config.client.owners.includes(req.user.id);
    const isReviewer = member?.roles.cache.has(config.server.roles.botReviewer);

    if (!isOwner && !isReviewer) {
      return res.render("404", {
        bot: global.client || null,
        path: req.path,
        user: req.user,
        req,
        message: "Nie masz uprawnień do usuwania komentarzy."
      });
    }

    if (!commentId || !serverID) {
      return res.render("404", {
        bot: global.client || null,
        path: req.path,
        user: req.user,
        req,
        message: "Brakuje wymaganych danych (commentId lub serverID)."
      });
    }

    // Szukamy serwera
    const serverData = await serversdata.findOne({ serverID });
    if (!serverData) {
      return res.render("404", {
        bot: global.client || null,
        path: req.path,
        user: req.user,
        req,
        message: "Nie znaleziono serwera."
      });
    }

    // Szukamy komentarza
    const commentIndex = serverData.rates.findIndex(rate => rate.id === commentId);
    if (commentIndex === -1) {
      return res.render("404", {
        bot: global.client || null,
        path: req.path,
        user: req.user,
        req,
        message: "Komentarz nie istnieje."
      });
    }

    // Usuwamy komentarz
    serverData.rates.splice(commentIndex, 1);
    await serverData.save();

    return res.redirect("/dashboard/comments");
  } catch (e) {
    console.error("[Delete Comment Error]", e);
    return res.render("500", {
      bot: global.client || null,
      path: req.path,
      user: req.user,
      req,
      message: "Wystąpił błąd podczas usuwania komentarza."
    });
  }
});

router.get("/bots/comment/delete", async (req, res) => {
  try {
    const { commentId, botID } = req.query;

    if (!req.isAuthenticated() || !req.user) {
      return res.render("404", {
        bot: global.client || null,
        path: req.path,
        user: null,
        req,
        message: "Musisz być zalogowany, aby usunąć komentarz."
      });
    }

    // Uprawnienia
    const guild = global.client.guilds.cache.get(config.server.id);
    if (!guild) throw new Error("Guild not found");

    const member = await guild.members.fetch(req.user.id).catch(() => null);
    const isOwner = config.client.owners.includes(req.user.id);
    const isReviewer = member?.roles.cache.has(config.server.roles.botReviewer);

    if (!isOwner && !isReviewer) {
      return res.render("404", {
        bot: global.client || null,
        path: req.path,
        user: req.user,
        req,
        message: "Nie masz uprawnień do usuwania komentarzy."
      });
    }

    if (!commentId || !botID) {
      return res.render("404", {
        bot: global.client || null,
        path: req.path,
        user: req.user,
        req,
        message: "Brakuje wymaganych danych (commentId lub botID)."
      });
    }

    // Szukamy bota
    const botsdata = require("../../database/models/bots/bots.js");
    const botData = await botsdata.findOne({ botID });
    if (!botData) {
      return res.render("404", {
        bot: global.client || null,
        path: req.path,
        user: req.user,
        req,
        message: "Nie znaleziono bota."
      });
    }

    // Szukamy komentarza
    const commentIndex = botData.rates.findIndex(rate => rate.id === commentId);
    if (commentIndex === -1) {
      return res.render("404", {
        bot: global.client || null,
        path: req.path,
        user: req.user,
        req,
        message: "Komentarz nie istnieje."
      });
    }

    // Usuwamy komentarz
    botData.rates.splice(commentIndex, 1);
    await botData.save();

    return res.redirect("/dashboard/comments");
  } catch (e) {
    console.error("[Delete Bot Comment Error]", e);
    return res.render("500", {
      bot: global.client || null,
      path: req.path,
      user: req.user,
      req,
      message: "Wystąpił błąd podczas usuwania komentarza."
    });
  }
});

module.exports = router;