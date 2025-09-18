const app = require('express').Router();

console.success('[Bots] /bots/vote.js router loaded.'.brightYellow);

const votes = require("../../database/models/bots/vote.js");
const botsdata = require("../../database/models/bots/bots.js");
const VoteAbuseDetector = require('../../utils/voteAbuseDetector.js');

app.post('/bot/:id/vote', async (req, res) => {
    try {
        const ip = req.cf_ip;
        const ratelimit = ratelimitMap.get(ip);
        if (ratelimit && ((ratelimit + 5000) > Date.now())) return error(res, "Osiągnąłeś limit! Spróbuj ponownie za kilka sekund.");
        else ratelimitMap.set(ip, Date.now());

        if (!req.user) return error(res, "Musisz być zalogowany, aby głosować!");

        const user = await global.client.users.fetch(req.user.id);
        if (!user.avatar) {
            return error(res, "Twoje konto nie spełnia wymagań do głosowania.");
        }

        if (user.createdTimestamp + 2592000000 > Date.now()) {
            return error(res, "Twoje konto nie spełnia wymagań do głosowania.");
        }

        let botdata = await botsdata.findOne({
            botID: req.params.id
        });

        if (!botdata) return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Bot, którego szukasz nie istnieje."
        });

        if (botdata.status != "Approved") return error(res, "Aktualny bot, nie został jeszcze zatwierdzony.");

        let voted = await votes.findOne({ userID: req.user.id, botID: req.params.id });
        if (voted) {
            let timeLeft = 10800000 - (Date.now() - voted.Date); // 3 hours
            if (timeLeft > 0) {
                let hours = Math.floor(timeLeft / 3600000);
                let minutes = Math.floor((timeLeft % 3600000) / 60000);
                let seconds = Math.floor(((timeLeft % 3600000) % 60000) / 1000);
                let totalTime = `${hours > 0 ? `${hours} godz, ` : ""}${minutes > 0 ? `${minutes} min, ` : ""}${seconds > 0 ? `${seconds} sek` : ""}`;
                return res.json({
                    error: true,
                    message: `Już głosowałeś na tego bota. Możesz zagłosować ponownie za <strong>${totalTime}</strong>.`
                });
            }
        }

        // Sprawdź czy głosowanie jest podejrzane
        const abuseCheck = await VoteAbuseDetector.checkForAbuse(req.params.id, req.user.id, ip);
        
        if (abuseCheck.isSuspicious) {
            // Wyślij powiadomienie na kanał #sus
            const susChannel = global.client.channels.cache.get('1388550329863504023'); // Zamień na ID kanału
            if (susChannel) {
                susChannel.send({
                    content: `🚨 **Podejrzane głosowanie** 🚨
\n**Bot:** <@${req.params.id}> (${req.params.id})
\n**Użytkownik:** <@${req.user.id}> (${req.user.id})
\n**IP:** ${ip}
\n**Powody:**\n- ${abuseCheck.reasons.join('\n- ')}
\n**Czas:** <t:${Math.floor(Date.now()/1000)}:R>`
                });
            }
        }

        await votes.findOneAndUpdate({ userID: req.user.id, botID: req.params.id }, {
            $set: {
                Date: Date.now(),
                ip: ip // Zapisz IP dla późniejszej analizy
            }
        }, {
            upsert: true
        });

        // Aktualizuj liczbę głosów i pobierz zaktualizowane dane
        const updatedBot = await botsdata.findOneAndUpdate({ botID: req.params.id }, {
            $inc: {
                votes: 1
            }
        }, {
            upsert: true,
            new: true // Zwróć zaktualizowany dokument
        });

        // Wyślij webhook po pomyślnym oddaniu głosu
        try {
            await global.executeVoteWebhook(req.user, updatedBot);
            console.log(`[WEBHOOK] Wysłano webhook dla bota ${req.params.id}`);
        } catch (webhookError) {
            console.error(`[WEBHOOK] Błąd podczas wysyłania webhooka dla bota ${req.params.id}:`, webhookError);
        }

        setTimeout(async () => {
            await votes.deleteOne({ userID: req.user.id, botID: req.params.id });
        }, 10800000); // 3 hours

        return res.json({
            error: false,
            message: "Głosowanie zakończyło się sukcesem ❤️"
        });
    } catch (e) {
        console.log(e.stack);
        return error(res, 'wygląda na to, że wystąpił błąd, proszę spróbować ponownie później. (Administratorzy zostali powiadomieni).');
    }
});

module.exports = app;