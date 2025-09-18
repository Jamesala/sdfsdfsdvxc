const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const moment = require('moment');
const botsdata = require("../../database/models/bots/bots.js");

console.success("[Bots] /bots/comment.js router loaded.".brightYellow);

// Rate limiting map
const ratelimitMap = new Map();

// Error function
function error(res, message) {
    return res.json({ error: true, message: message });
}

// Profanity filter list (can be expanded)
const bannedWords = [
    // Polish bad words
    'kurwa', 'chuj', 'jebany', 'pierdol', 'pierdole', 'pierdal', 'pierdolony',
    'pierdolić', 'jebać', 'jebie', 'jebiący', 'jebana', 'jebany', 'jebane',
    'jebani', 'jebanka', 'jebanko', 'jebanku', 'jebankiem', 'jebankach',
    '.gg', 'discordzik.pl', 'czarny', 'murzyn',
    // English bad words
    'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'whore',
    'motherfucker', 'cock', 'bastard', 'slut', 'douche', 'fag', 'faggot'
];

// Function to check for profanity
function containsProfanity(text) {
    const lowerText = text.toLowerCase();
    return bannedWords.some(word => lowerText.includes(word.toLowerCase()));
}

router.post("/bots/comment", async (req, res) => {
    try {
        // Ensure the user is authenticated
        if (!req.user) {
            return res.render("404.ejs", {
                bot: global.client || null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                message: "Aby móc komentować bota, musisz się zalogować."
            });
        }

        // Rate limiting based on IP
        const ip = req.cf_ip;
        const ratelimit = ratelimitMap.get(ip);
        if (ratelimit && ((ratelimit + 5000) > Date.now())) {
            return error(res, 'Osiągnąłeś limit szybkości! Spróbuj ponownie za kilka sekund.');
        }
        ratelimitMap.set(ip, Date.now());

        // Destructure and validate request body
        let { botID, comment, stars } = req.body;

        if (typeof comment !== "string" || comment.trim().length === 0) {
            return error(res, "Proszę podać prawidłowy komentarz.");
        }
        if (typeof stars !== "string" || !/^[1-5]$/.test(stars)) {
            return error(res, "Proszę podać prawidłową ocenę gwiazdkową (1-5).");
        }
        if (comment.length > 100) {
            return error(res, "Twój komentarz jest za długi. Upewnij się, że ma mniej niż 100 znaków.");
        }

        // Fetch bot data
        const botdata = await botsdata.findOne({ botID });
        if (!botdata) {
            return res.render("404.ejs", {
                bot: global.client || null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                message: "Bot, którego szukasz nie istnieje."
            });
        }

        // Prevent self-commenting
        if (botdata.ownerID === req.user.id || botdata.coowners.includes(req.user.id)) {
            return error(res, "Nie możesz komentować własnego bota.");
        }

        // Check if user has already rated the bot
        if (botdata.rates?.some(rate => rate.author === req.user.id)) {
            return error(res, "Już oceniłeś tego bota.");
        }

        // Add new comment
        const comment_id = crypto.randomBytes(16).toString("hex");
        await botsdata.updateOne(
            { botID },
            {
                $push: {
                    rates: {
                        author: req.user.id,
                        star_rate: stars,
                        message: comment.trim(),
                        id: comment_id,
                        date: Date.now()
                    }
                }
            },
            { upsert: true }
        );

        // Logowanie komentarza do kanału "komlog" TYLKO jeśli ocena jest większa niż 0
        if (stars !== '0' && global.client && global.config.server.channels.komlog) {
            try {
                const channel = global.client.channels.cache.get(global.config.server.channels.komlog);
                if (channel) {
                    channel.send({
                        content: ` \`📓\` Nowy komentarz do [Bota](https://discordzik.pl/bot/${botdata.botID}) dodany przez ${req.user.id}:
\n\`🌟\` Ocena: ${stars}
\n\`💬\` Komentarz: ${comment}`
                    });
                }
            } catch (error) {
                console.error('Błąd podczas logowania komentarza:', error);
            }
        }

        // Respond with success
        return res.json({
            error: false,
            author: req.user.id,
            star_rate: stars,
            id: comment_id,
            stars: [1, 2, 3, 4, 5],
            message: "Komentarz dodano pomyślnie."
        });

    } catch (error) {
        console.error(error.stack);
        return error(res, "Wystąpił błąd. Spróbuj ponownie później. Administratorzy zostali powiadomieni.");
    }
});

// Reply to a comment
router.post("/bots/comment/reply", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: true, message: "Musisz się zalogować, aby odpowiadać na komentarze." });
        }

        const { commentId, botID, message } = req.body;
        
        if (!commentId || !message || !botID) {
            return res.status(400).json({ error: true, message: "Brakujące wymagane pola." });
        }

        // Check for profanity in reply
        if (containsProfanity(message)) {
            return res.status(400).json({ 
                error: true, 
                message: "Twoja odpowiedź zawiera niedozwoloną treść. Prosimy o kulturalne wyrażanie się." 
            });
        }

        const botdata = await botsdata.findOne({ botID: botID });

        if (!botdata) {
            return res.status(404).json({ error: true, message: "Nie znaleziono bota." });
        }

        const commentIndex = botdata.rates.findIndex(rate => rate.id === commentId);
        if (commentIndex === -1) {
            return res.status(404).json({ error: true, message: "Nie znaleziono komentarza." });
        }

        // Pobierz pełne dane użytkownika
        let user;
        try {
            user = global.client ? await global.client.users.fetch(req.user.id) : {
                username: req.user.username,
                avatar: req.user.avatar,
                tag: req.user.username
            };
        } catch (error) {
            user = {
                username: req.user.username,
                avatar: req.user.avatar,
                tag: req.user.username
            };
        }

        const newReply = {
            author: req.user.id,
            authorName: user.username,
            authorAvatar: user.avatar,
            message: message,
            date: new Date()
        };

        botdata.rates[commentIndex].replies = botdata.rates[commentIndex].replies || [];
        botdata.rates[commentIndex].replies.push(newReply);

        await botdata.save();

        // Logowanie odpowiedzi do kanału "replylog"
        if (global.config.server.channels.replylog && global.client) {
            try {
                const comment = botdata.rates[commentIndex];
                const channel = global.client.channels.cache.get(global.config.server.channels.replylog);
                if (channel) {
                    channel.send({
                        content: `\`💬\` Nowa odpowiedź do [komentarza](https://discordzik.pl/bot/${botID}#comment-${commentId}) na bocie (ID: ${botID}):
\n\`👤\` Autor odpowiedzi: ${user.tag} (${req.user.id})
\n\`📝\` Treść odpowiedzi: ${message}
\n\`📌\` Oryginalny komentarz: ${comment.message.substring(0, 100)}${comment.message.length > 100 ? '...' : ''}`
                    });
                }
            } catch (error) {
                console.error('Błąd podczas logowania odpowiedzi:', error);
            }
        }

        return res.json({
            error: false,
            message: "Odpowiedź została dodana pomyślnie.",
            reply: newReply
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ 
            error: true, 
            message: "Wystąpił błąd podczas dodawania odpowiedzi." 
        });
    }
});

// Delete reply to comment
router.post("/bots/comment/reply/delete", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ 
                error: true, 
                message: "Musisz się zalogować, aby usunąć odpowiedzi." 
            });
        }

        const { botID, commentId, replyId } = req.body;
        
        if (!botID || !commentId || !replyId) {
            return res.status(400).json({ 
                error: true, 
                message: "Brakujące wymagane pola." 
            });
        }

        const botdata = await botsdata.findOne({ botID: botID });

        if (!botdata) {
            return res.status(404).json({ 
                error: true, 
                message: "Nie znaleziono bota." 
            });
        }

        const commentIndex = botdata.rates.findIndex(rate => rate.id === commentId);
        if (commentIndex === -1) {
            return res.status(404).json({ 
                error: true, 
                message: "Nie znaleziono komentarza." 
            });
        }

        const replyIndex = botdata.rates[commentIndex].replies.findIndex(
            reply => reply._id.toString() === replyId || reply.id === replyId
        );
        
        if (replyIndex === -1) {
            return res.status(404).json({ 
                error: true, 
                message: "Nie znaleziono odpowiedzi." 
            });
        }

        // Sprawdź czy użytkownik jest autorem odpowiedzi lub administratorem
        const reply = botdata.rates[commentIndex].replies[replyIndex];
        if (reply.author !== req.user.id && !req.user.admin) {
            return res.status(403).json({ 
                error: true, 
                message: "Nie masz uprawnień do usunięcia tej odpowiedzi." 
            });
        }

        // Logowanie usunięcia odpowiedzi do kanału "replylog"
        if (global.config.server.channels.replylog && global.client) {
            try {
                const user = await global.client.users.fetch(req.user.id).catch(() => ({ tag: req.user.username }));
                const comment = botdata.rates[commentIndex];
                const channel = global.client.channels.cache.get(global.config.server.channels.replylog);
                if (channel) {
                    channel.send({
                        content: `\`🗑️\` Usunięto odpowiedź do [komentarza](https://discordzik.pl/bot/${botID}#comment-${commentId}) na bocie (ID: ${botID}):
\n\`👤\` Autor odpowiedzi: ${reply.authorName} (${reply.author})
\n\`🛠️\` Usunięto przez: ${user.tag} (${req.user.id})
\n\`📝\` Treść usuniętej odpowiedzi: ${reply.message.substring(0, 100)}${reply.message.length > 100 ? '...' : ''}
\n\`📌\` Oryginalny komentarz: ${comment.message.substring(0, 100)}${comment.message.length > 100 ? '...' : ''}`
                    });
                }
            } catch (error) {
                console.error('Błąd podczas logowania usunięcia odpowiedzi:', error);
            }
        }

        // Usuń odpowiedź
        botdata.rates[commentIndex].replies.splice(replyIndex, 1);
        await botdata.save();

        return res.json({
            error: false,
            message: "Odpowiedź została usunięta pomyślnie."
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ 
            error: true, 
            message: "Wystąpił błąd podczas usuwania odpowiedzi." 
        });
    }
});

module.exports = router;