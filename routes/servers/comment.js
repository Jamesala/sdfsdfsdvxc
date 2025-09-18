const express = require('express');
const router = express.Router();
const serversdata = require("../../database/models/servers/server.js");

console.success("[Servers] /servers/comment.js router loaded.".brightYellow);

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

// Rate limit tracking
const userServerCommentCount = new Map(); // Tracks comments per user per server

// Function to check for profanity
function containsProfanity(text) {
    const lowerText = text.toLowerCase();
    return bannedWords.some(word => lowerText.includes(word.toLowerCase()));
}

// Post a comment
router.post("/servers/comment", async (req, res) => {
    try {
        if (!req.user) return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Musisz być zalogowany, aby móc komentować serwer."
        });

        const ip = req.cf_ip;
        const ratelimit = ratelimitMap.get(ip);
        if (ratelimit && ((ratelimit + 5000) > Date.now())) return error(res, 'Osiągnąłeś limit szybkości! Spróbuj ponownie za kilka sekund.');
        ratelimitMap.set(ip, Date.now());

        let { serverID, comment, stars } = req.body;
        console.log(req.body);

        // Check user comment limit per server
        const userServerKey = `${req.user.id}-${serverID}`;
        const commentCount = userServerCommentCount.get(userServerKey) || 0;
        
        if (commentCount >= 10) {
            return error(res, "Osiągnąłeś limit 10 komentarzy na ten serwer.");
        }

        const serverdata = await serversdata.findOne({
            serverID: serverID
        });

        if (!serverdata) return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: "Bot, którego szukasz nie istnieje."
        });

        if (serverdata.ownerID == req.user.id) return error(res, "Nie możesz komentować na swoim własnym serwerze.");

        if (serverdata?.rates?.length > 0) {
            let find = serverdata.rates.find(rate => rate.author === req.user.id);
            if (find) return error(res, "Już oceniłeś ten serwer.");
        }

        comment = comment?.trim();
        if (!comment || typeof comment !== "string") return error(res, "Upewnij się, że wpisałeś <strong>komentarz</strong>.");
        if (!stars || typeof stars !== "string" || !['1', '2', '3', '4', '5'].includes(stars)) return error(res, "Musisz wybrać ocenę w postaci gwiazdek (1-5).");
        if (comment.length > 200) return error(res, "Twój komentarz jest za długi. Upewnij się, że jest krótszy niż <strong>200</strong> znaków.");
        
        // Check for profanity
        if (containsProfanity(comment)) {
            return error(res, "Twój komentarz zawiera niedozwoloną treść. Prosimy o kulturalne wyrażanie się.");
        }

        let comment_id = require("crypto").randomBytes(16).toString("hex");
        await serversdata.updateOne({
            serverID: serverID
        }, {
            $push: {
                rates: {
                    author: req.user.id,
                    star_rate: stars,
                    message: comment,
                    id: comment_id,
                    date: Date.now(),
                    replies: [] // Initialize empty replies array
                }
            }
        }, {
            upsert: true
        });
        
        // Update comment count
        userServerCommentCount.set(userServerKey, commentCount + 1);
        
        // Logowanie komentarza do kanału "komlog" TYLKO jeśli ocena jest większa niż 0
        if (stars !== '0') {
            global.client.channels.cache.get(global.config.server.channels.komlog).send({
                content: ` \`📓\` Nowy komentarz do [Serwer](https://discordzik.pl/server/${serverdata.serverID}) dodany przez ${req.user.id}:
\n\`🌟\` Ocena: ${stars}
\n\`💬\` Komentarz: ${comment}`
            });
        }

        return res.json({
            error: false,
            author: req.user.id,
            star_rate: stars,
            id: comment_id,
            stars: [1, 2, 3, 4, 5],
            message: "Komentarz dodany pomyślnie."
        });
    } catch (e) {
        console.log(e.stack);
        return error(res, "it seems like an error has occurred, please try again later. (The administrators have been notified).");
    }
});

// Reply to a comment
router.post("/servers/comment/reply", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: true, message: "Musisz się zalogować, aby odpowiadać na komentarze." });
        }

        const { commentId, serverID, message } = req.body;
        
        if (!commentId || !message || !serverID) {
            return res.status(400).json({ error: true, message: "Brakujące wymagane pola." });
        }

        // Check for profanity in reply
        if (containsProfanity(message)) {
            return res.status(400).json({ 
                error: true, 
                message: "Twoja odpowiedź zawiera niedozwoloną treść. Prosimy o kulturalne wyrażanie się." 
            });
        }

        const serverdata = await serversdata.findOne({ serverID: serverID });

        if (!serverdata) {
            return res.status(404).json({ error: true, message: "Nie znaleziono serwera." });
        }

        const commentIndex = serverdata.rates.findIndex(rate => rate.id === commentId);
        if (commentIndex === -1) {
            return res.status(404).json({ error: true, message: "Nie znaleziono komentarza." });
        }

        // Pobierz pełne dane użytkownika
        const user = await global.client.users.fetch(req.user.id);

        const newReply = {
            author: req.user.id,
            authorName: user.username,
            authorAvatar: user.avatar,
            message: message,
            date: new Date()
        };

        serverdata.rates[commentIndex].replies = serverdata.rates[commentIndex].replies || [];
        serverdata.rates[commentIndex].replies.push(newReply);

        await serverdata.save();

        // Logowanie odpowiedzi do kanału "replylog"
        if (global.config.server.channels.replylog) {
            const comment = serverdata.rates[commentIndex];
            global.client.channels.cache.get(global.config.server.channels.replylog).send({
                content: `\`💬\` Nowa odpowiedź do [komentarza](https://discordzik.pl/server/${serverID}#comment-${commentId}) na serwerze (ID: ${serverID}):
\n\`👤\` Autor odpowiedzi: ${user.tag} (${req.user.id})
\n\`📝\` Treść odpowiedzi: ${message}
\n\`📌\` Oryginalny komentarz: ${comment.message.substring(0, 100)}${comment.message.length > 100 ? '...' : ''}`
            });
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
router.post("/servers/comment/reply/delete", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ 
                error: true, 
                message: "Musisz się zalogować, aby usunąć odpowiedzi." 
            });
        }

        const { serverID, commentId, replyId } = req.body;
        
        if (!serverID || !commentId || !replyId) {
            return res.status(400).json({ 
                error: true, 
                message: "Brakujące wymagane pola." 
            });
        }

        const serverdata = await serversdata.findOne({ serverID: serverID });

        if (!serverdata) {
            return res.status(404).json({ 
                error: true, 
                message: "Nie znaleziono serwera." 
            });
        }

        const commentIndex = serverdata.rates.findIndex(rate => rate.id === commentId);
        if (commentIndex === -1) {
            return res.status(404).json({ 
                error: true, 
                message: "Nie znaleziono komentarza." 
            });
        }

        const replyIndex = serverdata.rates[commentIndex].replies.findIndex(
            reply => reply._id.toString() === replyId || reply.id === replyId
        );
        
        if (replyIndex === -1) {
            return res.status(404).json({ 
                error: true, 
                message: "Nie znaleziono odpowiedzi." 
            });
        }

        // Sprawdź czy użytkownik jest autorem odpowiedzi lub administratorem
        const reply = serverdata.rates[commentIndex].replies[replyIndex];
        if (reply.author !== req.user.id && !req.user.admin) {
            return res.status(403).json({ 
                error: true, 
                message: "Nie masz uprawnień do usunięcia tej odpowiedzi." 
            });
        }

        // Logowanie usunięcia odpowiedzi do kanału "replylog"
        if (global.config.server.channels.replylog) {
            const user = await global.client.users.fetch(req.user.id);
            const comment = serverdata.rates[commentIndex];
            global.client.channels.cache.get(global.config.server.channels.replylog).send({
                content: `\`🗑️\` Usunięto odpowiedź do [komentarza](https://discordzik.pl/server/${serverID}#comment-${commentId}) na serwerze (ID: ${serverID}):
\n\`👤\` Autor odpowiedzi: ${reply.authorName} (${reply.author})
\n\`🛠️\` Usunięto przez: ${user.tag} (${req.user.id})
\n\`📝\` Treść usuniętej odpowiedzi: ${reply.message.substring(0, 100)}${reply.message.length > 100 ? '...' : ''}
\n\`📌\` Oryginalny komentarz: ${comment.message.substring(0, 100)}${comment.message.length > 100 ? '...' : ''}`
            });
        }

        // Usuń odpowiedź
        serverdata.rates[commentIndex].replies.splice(replyIndex, 1);
        await serverdata.save();

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