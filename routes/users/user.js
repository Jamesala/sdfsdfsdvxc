const app = require('express').Router();

console.success('[Users] /users/user.js router loaded.'.brightYellow);

const profilesdata = require("../../database/models/profile.js");
const botsdata = require("../../database/models/bots/bots.js");
const serversdata = require("../../database/models/servers/server.js");
const { getUserBadges, checkAndAwardBadges } = require('../../utils/badgeChecker');

app.get('/profile', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.render("404.ejs", {
            bot: global.client || null,
            path: req.path,
            user: null, // Nie trzeba sprawdzać ponownie isAuthenticated()
            req: req,
            message: "Musisz być zalogowany, aby zobaczyć tę stronę."
        });
    }

    res.redirect(`/profile/${req.user.id}`);
});

app.get('/profile/:id', async (req, res) => {
    if (!req.params.id) return res.redirect("/profile/" + req.user.id);
    let member;
    try {
        member = await client.users.fetch(req.params.id);
    } catch (e) {
        member = null;
    }

    if (member === null || member.bot) {
        return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Użytkownik, którego szukasz nie istnieje."
        });
    }

    let pdata = await profilesdata.findOne({
        userID: member.id
    });

    // Pobierz odznaki użytkownika i sprawdź nowe
    try {
        await checkAndAwardBadges(member.id);
    } catch (error) {
        console.error('[PROFILE] Error checking badges:', error);
    }

    const userBadges = await getUserBadges(member.id);

    console.log(`[PROFILE] Loaded ${userBadges.length} badges for user ${member.username}`);

    res.render("users/profile.ejs", {
        bot: global.client ? global.client : null,
        server: global.serverClient,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        pdata: pdata,
        member: member,
        bots: await botsdata.find({ $or: [{ ownerID: member.id }, { coowners: member.id }] }),
        servers: await serversdata.find({ ownerID: member.id }),
        userBadges: userBadges,
        serverClient: global.serverClient || global.client
    });
});

// Edit biography
app.post('/profile/:id/edit/bio', async (req, res) => {
    try {
        const ip = req.cf_ip;
        const ratelimit = ratelimitMap.get(ip);
        if (ratelimit && ((ratelimit + 5000) > Date.now())) return error(res, 'Osiągnąłeś limit szybkości! Spróbuj ponownie za kilka sekund.');
        else ratelimitMap.set(ip, Date.now());

        let { biography } = req.body;

        if (!req.isAuthenticated()) return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Musisz się zalogować, aby zobaczyć tę stronę."
        });
        let member;
        try {
            member = await client.users.fetch(req.params.id);
        } catch (e) {
            member = null;
        }

        if (member === null || member.bot) {
            return res.render("404.ejs", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                message: "Użytkownik, którego szukasz nie istnieje."
            });
        }

        let pdata = await profilesdata.findOne({
            userID: member.id
        });

        if (!pdata) {
            pdata = await new profilesdata({
                userID: member.id,
                biography: biography
            }).save()
        }

        if (pdata && pdata.userID !== req.user.id) return error(res, 'Nie masz uprawnień do edycji tego profilu.');

        if (biography.length > 100) return error(res, 'Biografia musi zawierać mniej niż 100 znaków.');
        await profilesdata.findOneAndUpdate({
            userID: member.id
        }, {
            $set: {
                biography: biography
            }
        }, {
            upsert: true
        });

        return res.json({
            error: false,
            message: "Twoja biografia została zaktualizowana ;)"
        });
    } catch (e) {
        concole.log(e.stack)
        return error(res, 'wygląda na to, że wystąpił błąd, proszę spróbować ponownie później. (Administratorzy zostali powiadomieni).');
    }
});

app.get('/profile/:id/comments', async (req, res) => {
    try {
        let member;
        try {
            member = await client.users.fetch(req.params.id);
        } catch (e) {
            member = null;
        }

        if (!req.isAuthenticated()) return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Musisz się zalogować, aby zobaczyć tę stronę."
        });

        if (req.user && req.user.id !== member?.id) return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Nie masz uprawnień do przeglądania tej strony."
        });

        if (member === null || member.bot) {
            return res.render("404.ejs", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                message: "Użytkownik, którego szukasz nie istnieje."
            });
        }

        let pdata = await profilesdata.findOne({ userID: member.id });

        // Pobierz odznaki użytkownika
        const userBadges = await getUserBadges(member.id);

        // Pobierz boty i serwery z komentarzami użytkownika
        const bots = await botsdata.find({
            rates: { $elemMatch: { author: member.id } }
        }).sort({ "rates.date": -1 });

        const servers = await serversdata.find({
            rates: { $elemMatch: { author: member.id } }
        }).sort({ "rates.date": -1 });

        // Aktualizuj dane serwerów z Discorda
        const updatedServers = await Promise.all(servers.map(async (server) => {
            try {
                const discordServer = await global.serverClient.guilds.fetch(server.serverID);
                return {
                    ...server._doc,
                    serverName: discordServer.name || server.serverName || `Serwer ${server.serverID}`,
                    serverIcon: discordServer.icon || server.serverIcon || null
                };
            } catch (e) {
                console.error(`Nie udało się pobrać danych serwera ${server.serverID}:`, e);
                return {
                    ...server._doc,
                    serverName: server.serverName || `Serwer ${server.serverID}`,
                    serverIcon: server.serverIcon || null
                };
            }
        }));

        // Pobierz wszystkie odpowiedzi użytkownika
        const replies = [];

        // Odpowiedzi na boty
        const botComments = await botsdata.find({
            "rates.replies.author": member.id
        });

        botComments.forEach(bot => {
            bot.rates.forEach(comment => {
                comment.replies?.forEach(reply => {
                    if (reply.author === member.id) {
                        replies.push({
                            type: 'bot',
                            parentId: bot.botID,
                            parentName: bot.username,
                            commentId: comment.id,
                            replyId: reply._id || reply.id,
                            message: reply.message,
                            date: reply.date,
                            authorName: reply.authorName,
                            authorAvatar: reply.authorAvatar
                        });
                    }
                });
            });
        });

        // Odpowiedzi na serwery
        const serverComments = await serversdata.find({
            "rates.replies.author": member.id
        });

        serverComments.forEach(server => {
            server.rates.forEach(comment => {
                comment.replies?.forEach(reply => {
                    if (reply.author === member.id) {
                        replies.push({
                            type: 'server',
                            parentId: server.serverID,
                            parentName: server.serverName,
                            commentId: comment.id,
                            replyId: reply._id || reply.id,
                            message: reply.message,
                            date: reply.date,
                            authorName: reply.authorName,
                            authorAvatar: reply.authorAvatar
                        });
                    }
                });
            });
        });

        // Sortuj odpowiedzi od najnowszych
        replies.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.render('users/comments', {
            bot: global.client ? global.client : null,
            server: global.serverClient,
            path: req.path,
            user: req.user,
            req: req,
            pdata: pdata,
            member: member,
            bots: bots,
            servers: updatedServers, // Użyj zaktualizowanej listy serwerów
            replies: replies,
            replyCount: replies.length,
            userBadges: userBadges
        });
    } catch (e) {
        console.error(e.stack);
        return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Wystąpił błąd podczas ładowania strony."
        });
    }
});

// Delete bot reply endpoint
app.post('/bots/comment/reply/delete', async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            return res.status(401).json({
                error: true,
                message: 'Musisz być zalogowany, aby wykonać tę akcję.'
            });
        }

        const { botID, commentId, replyId } = req.body;

        if (!botID || !commentId || !replyId) {
            return res.status(400).json({
                error: true,
                message: 'Brak wymaganych parametrów.'
            });
        }

        const result = await botsdata.updateOne(
            {
                botID: botID,
                "rates._id": commentId
            },
            { 
                $pull: { 
                    "rates.$.replies": { 
                        _id: replyId, 
                        author: req.user.id 
                    } 
                } 
            }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({
                error: true,
                message: 'Odpowiedź nie została znaleziona lub nie masz uprawnień do jej usunięcia.'
            });
        }

        return res.json({
            error: false,
            message: 'Odpowiedź została usunięta pomyślnie.'
        });

    } catch (e) {
        console.error('Błąd podczas usuwania odpowiedzi bota:', e.stack);
        return res.status(500).json({
            error: true,
            message: 'Wystąpił błąd podczas usuwania odpowiedzi.'
        });
    }
});

// Delete comment - POPRAWIONA WERSJA
app.post('/profile/:id/delete-comment', async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            return res.status(401).json({
                error: true,
                message: 'Musisz być zalogowany, aby wykonać tę akcję.'
            });
        }

        const { commentId, type, botID, serverID } = req.body;

        if (!commentId || !type) {
            return res.status(400).json({
                error: true,
                message: 'Brak wymaganych parametrów.'
            });
        }

        // Sprawdź czy użytkownik próbuje usunąć własny komentarz
        if (req.params.id !== req.user.id) {
            return res.status(403).json({
                error: true,
                message: 'Nie masz uprawnień do wykonania tej akcji.'
            });
        }

        let result;
        if (type === 'bot') {
            if (!botID) {
                return res.status(400).json({
                    error: true,
                    message: 'Brak ID bota.'
                });
            }

            result = await botsdata.updateOne(
                {
                    botID: botID,
                    "rates.id": commentId,
                    "rates.author": req.user.id
                },
                { $pull: { rates: { id: commentId, author: req.user.id } } }
            );
        } else if (type === 'server') {
            if (!serverID) {
                return res.status(400).json({
                    error: true,
                    message: 'Brak ID serwera.'
                });
            }

            result = await serversdata.updateOne(
                {
                    serverID: serverID,
                    "rates.id": commentId,
                    "rates.author": req.user.id
                },
                { $pull: { rates: { id: commentId, author: req.user.id } } }
            );
        } else {
            return res.status(400).json({
                error: true,
                message: 'Nieprawidłowy typ komentarza.'
            });
        }

        if (result.modifiedCount === 0) {
            return res.status(404).json({
                error: true,
                message: 'Komentarz nie został znaleziony lub nie masz uprawnień do jego usunięcia.'
            });
        }

        return res.json({
            error: false,
            message: 'Komentarz został usunięty pomyślnie.'
        });

    } catch (e) {
        console.error('Błąd podczas usuwania komentarza:', e.stack);
        return res.status(500).json({
            error: true,
            message: 'Wystąpił błąd podczas usuwania komentarza.'
        });
    }
});

app.get('/profile/:id/referrals', async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            return res.render("404.ejs", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: null,
                req: req,
                message: "Musisz być zalogowany, aby zobaczyć tę stronę."
            });
        }

        let member;
        try {
            member = await client.users.fetch(req.params.id);
        } catch (e) {
            member = null;
        }

        if (member === null || member.bot) {
            return res.render("404.ejs", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                message: "Użytkownik, którego szukasz nie istnieje."
            });
        }

        // Sprawdź czy użytkownik próbuje przeglądać nie swój profil
        if (req.params.id !== req.user.id) {
            return res.render("404.ejs", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                message: "Nie masz uprawnień do przeglądania tej strony."
            });
        }

        // Automatyczne tworzenie profilu jeśli nie istnieje
        let pdata = await profilesdata.findOneAndUpdate(
            { userID: member.id },
            {
                $setOnInsert: {
                    userID: member.id,
                    points: 0,
                    referralCount: 0,
                    transactions: [],
                    // Generuj kod referencyjny jeśli nie istnieje
                    referralCode: Math.random().toString(36).substring(2, 8).toUpperCase()
                }
            },
            {
                upsert: true,
                new: true
            }
        );

        // Jeśli profil istniał, ale nie miał kodu referencyjnego
        if (!pdata.referralCode) {
            pdata = await profilesdata.findOneAndUpdate(
                { userID: member.id },
                {
                    $set: {
                        referralCode: Math.random().toString(36).substring(2, 8).toUpperCase()
                    }
                },
                { new: true }
            );
        }

        // Pobierz odznaki użytkownika
        const userBadges = await getUserBadges(member.id);

        res.render('users/referrals', {
            bot: global.client ? global.client : null,
            server: global.serverClient,
            path: req.path,
            user: req.user,
            req: req,
            pdata: pdata,
            member: member,
            referralLink: `${config.website.url}/ref/${pdata.referralCode}`, // Dodaj link referencyjny
            userBadges: userBadges
        });
    } catch (e) {
        console.error('Błąd podczas ładowania referencji:', e.stack);
        return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Wystąpił błąd podczas ładowania strony."
        });
    }
});

// Add task completion route
app.post('/profile/complete-task', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { taskType, clickedButton } = req.body;

    if (!taskType || clickedButton !== 'true') {
      return res.status(400).json({
        success: false,
        message: "Nieprawidłowe parametry lub nie potwierdzono wykonania zadania"
      });
    }

    let profile = await profilesdata.findOne({ userID: req.user.id });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profil nie został znaleziony"
      });
    }

    // Check if task already completed
    if (profile.userTasks && profile.userTasks[taskType]) {
      return res.status(400).json({
        success: false,
        message: "To zadanie zostało już wykonane"
      });
    }

    // Initialize userTasks if it doesn't exist
    if (!profile.userTasks) {
      profile.userTasks = {
        youtubeSubscribed: false,
        discordJoined: false,
        sharedServer: false
      };
    }

    // Initialize partnerBonuses if it doesn't exist
    if (!profile.partnerBonuses) {
      profile.partnerBonuses = {
        pointsPerYoutube: 10,
        pointsPerDiscord: 10,
        pointsPerServer: 10
      };
    }

    let pointsToAdd = 0;
    let taskName = '';

    switch(taskType) {
      case 'youtubeSubscribed':
        pointsToAdd = profile.partnerBonuses.pointsPerYoutube || 10;
        taskName = 'Subskrypcja YouTube';
        profile.userTasks.youtubeSubscribed = true;
        break;
      case 'discordJoined':
        pointsToAdd = profile.partnerBonuses.pointsPerDiscord || 10;
        taskName = 'Dołączenie na Discord';
        profile.userTasks.discordJoined = true;
        break;
      case 'sharedServer':
        pointsToAdd = 5;
        taskName = 'Udostępnienie serwera';
        profile.userTasks.sharedServer = true;
        break;
      default:
        return res.status(400).json({
          success: false,
          message: "Nieznany typ zadania"
        });
    }

    // Add points and transaction
    profile.points += pointsToAdd;
    if (!profile.transactions) profile.transactions = [];

    profile.transactions.push({
      type: 'earn',
      amount: pointsToAdd,
      date: new Date(),
      details: `Punkty za wykonanie zadania: ${taskName}`
    });

    await profile.save();

    // Log to rewardlog channel
    if (global.client && global.config.server.channels.rewardlog) {
      try {
        const userDiscord = await global.client.users.fetch(req.user.id).catch(() => null);
        const userTag = userDiscord ? `${userDiscord.username}#${userDiscord.discriminator}` : req.user.id;

        const embed = {
          color: 0x00FF00, // Zielony kolor
          title: '✅ Zadanie wykonane',
          fields: [
            { name: 'Użytkownik', value: `${userTag} (${req.user.id})`, inline: true },
            { name: 'Zadanie', value: taskName, inline: true },
            { name: 'Zdobyte punkty', value: pointsToAdd.toString(), inline: true },
            { name: 'Data', value: new Date().toLocaleString('pl-PL'), inline: false }
          ],
          timestamp: new Date()
        };

        await global.client.channels.cache.get(global.config.server.channels.rewardlog).send({
          embeds: [embed]
        });
      } catch (logError) {
        console.error('Błąd podczas wysyłania logu zadania:', logError);
      }
    }


    res.json({
      success: true,
      message: `Gratulacje! Otrzymałeś ${pointsToAdd} punktów za ${taskName}!`,
      newBalance: profile.points
    });

  } catch (error) {
    console.error('[Task Completion Error]', error);
    res.status(500).json({
      success: false,
      message: "Wystąpił błąd serwera"
    });
  }
});

// Add point redemption route
app.post('/profile/redeem-points', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { amount, type } = req.body;

    if (!amount || !type || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: "Nieprawidłowe parametry"
      });
    }

    let profile = await profilesdata.findOne({ userID: req.user.id });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profil nie został znaleziony"
      });
    }

    const pointsRequired = parseInt(amount);
    if (profile.points < pointsRequired) {
      return res.status(400).json({
        success: false,
        message: "Nie masz wystarczającej liczby punktów"
      });
    }

    let rewardName = '';
    switch(type) {
      case 'boost':
        rewardName = '7-dniowy boost serwera';
        break;
      case 'vip':
        rewardName = 'Status PRO na całe życie';
        break;
      case 'giftcard': // Changed from giftcard to Lifetime PRO status
        rewardName = 'Status PRO na całe życie';
        break;
      default:
        return res.status(400).json({
          success: false,
          message: "Nieznany typ nagrody"
        });
    }

    // Deduct points
    profile.points -= pointsRequired;

    // Add transaction
    if (!profile.transactions) profile.transactions = [];
    profile.transactions.push({
      type: 'redeem',
      amount: pointsRequired,
      date: new Date(),
      details: `Wymiana punktów na: ${rewardName}`
    });

    await profile.save();

    // Log redemption to Discord if available
    if (global.client && global.config.server.channels.reflog) {
      try {
        await global.client.channels.cache.get(global.config.server.channels.reflog).send({
          embeds: [{
            color: 0xf39c12,
            title: '🎁 Wymiana punktów',
            fields: [
              { name: 'Użytkownik', value: `<@${req.user.id}> (${req.user.username})`, inline: true },
              { name: 'Nagroda', value: rewardName, inline: true },
              { name: 'Koszt', value: `${pointsRequired} punktów`, inline: true }
            ],
            timestamp: new Date()
          }]
        });
      } catch (e) {
        console.error('Error logging redemption:', e);
      }
    }

    res.json({
      success: true,
      message: `Pomyślnie wymieniono ${pointsRequired} punktów na ${rewardName}!`,
      newBalance: profile.points
    });

  } catch (error) {
    console.error('[Point Redemption Error]', error);
    res.status(500).json({
      success: false,
      message: "Wystąpił błąd serwera"
    });
  }
});

module.exports = app;