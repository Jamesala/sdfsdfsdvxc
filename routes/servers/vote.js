const app = require('express').Router();
const serverVotes = require("../../database/models/serverVotes"); // Używamy tej samej kolekcji co w komendzie
const VoteAbuseDetector = require('../../utils/voteAbuseDetector');

console.success('[Servers] /servers/vote.js router loaded.'.brightYellow);

const ratelimitMap = new Map();

app.post('/server/:id/vote', async (req, res) => {
    try {
        const ip = req.cf_ip || req.ip;
        const ratelimit = ratelimitMap.get(ip);
        
        // Limit 5 sekund na IP
        if (ratelimit && ((ratelimit + 5000) > Date.now())) {
            return res.json({
                error: true,
                message: "Osiągnąłeś limit! Spróbuj ponownie za kilka sekund."
            });
        }
        ratelimitMap.set(ip, Date.now());

        if (!req.user) return error(res, "Musisz być zalogowany, aby głosować!");

        const user = await global.client.users.fetch(req.user.id).catch(() => null);
        if (!user) {
            return res.json({
                error: true,
                message: "Nie można zweryfikować Twojego konta Discord."
            });
        }

        // Weryfikacja awataru
        if (!user.avatar) {
            return res.json({
                error: true,
                message: "Aby głosować, musisz mieć ustawione zdjęcie profilowe na koncie Discord."
            });
        }

        // Weryfikacja wieku konta (min. 30 dni)
        if (user.createdTimestamp + 2592000000 > Date.now()) {
            return res.json({
                error: true,
                message: "Twoje konto jest zbyt młode. Musisz mieć konto przez co najmniej 30 dni, aby móc głosować."
            });
        }

        let serverdata = await serversdata.findOne({ serverID: req.params.id });
        if (!serverdata) {
            return res.render("404.ejs", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                message: "Serwer, którego szukasz nie istnieje."
            });
        }

        // Sprawdzenie w tej samej kolekcji co komenda Discord
        let voted = await serverVotes.findOne({ 
            userID: req.user.id, 
            serverID: req.params.id 
        });

        if (voted) {
            let timeLeft = 10800000 - (Date.now() - voted.Date);
            if (timeLeft > 0) {
                let hours = Math.floor(timeLeft / 3600000);
                let minutes = Math.floor((timeLeft % 3600000) / 60000);
                let seconds = Math.floor(((timeLeft % 3600000) % 60000) / 1000);
                let totalTime = `${hours ? `${hours} godz, ` : ""}${minutes ? `${minutes} min, ` : ""}${seconds ? `${seconds} sek` : ""}`;
                
                return res.json({
                    error: true,
                    message: `Już głosowałeś na ten serwer. Możesz zagłosować ponownie za <strong>${totalTime}</strong>.`
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
                    content: `🚨 **Podejrzane głosowanie na serwer** 🚨
\n**Serwer:** ${req.params.id}
\n**Użytkownik:** <@${req.user.id}> (${req.user.id})
\n**Powody:**\n- ${abuseCheck.reasons.join('\n- ')}
\n**Czas:** <t:${Math.floor(Date.now()/1000)}:R>`
                });
            }
        }

        await serverVotes.findOneAndUpdate(
            { userID: req.user.id, serverID: req.params.id },
            { 
                $set: { 
                    Date: Date.now(),
                    ip: ip 
                },
                $inc: { bumpCount: 1 } 
            },
            { upsert: true }
        );

        await serversdata.findOneAndUpdate(
            { serverID: req.params.id },
            { $inc: { votes: 1 } },
            { upsert: true }
        );

        // Usuwanie rekordu po 3 godzinach (opcjonalne)
        setTimeout(async () => {
            await serverVotes.deleteOne({ 
                userID: req.user.id, 
                serverID: req.params.id 
            });
        }, 10800000); // 3 hours

        return res.json({
            error: false,
            message: "Głosowanie zakończyło się sukcesem ❤️"
        });

    } catch (e) {
        console.error(e);
        return res.json({
            error: true,
            message: 'Wystąpił błąd, proszę spróbować ponownie później.'
        });
    }
});

function error(res, message) {
    return res.json({ error: true, message });
}

module.exports = app;