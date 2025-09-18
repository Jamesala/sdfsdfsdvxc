const express = require("express");
const BlockedUser = require("../database/models/BlockedUser");
const app = express.Router();

console.success("[Blocked] /blocked route loaded.".bgYellow.black);

// Trasa dla zbanowanych użytkowników
app.get("/blocked", async (req, res) => {
    // Zawsze renderuj stronę blocked bez dodatkowych sprawdzeń
    // Middleware już sprawdził czy użytkownik jest zbanowany
    
    let reason = "Brak podanego powodu";
    
    // Tylko jeśli użytkownik jest zalogowany, spróbuj pobrać powód
    if (req.isAuthenticated()) {
        try {
            const blockedUser = await BlockedUser.findOne({ userId: req.user.id });
            if (blockedUser && blockedUser.reason) {
                reason = blockedUser.reason;
            }
        } catch (error) {
            console.error('Błąd podczas pobierania powodu bana:', error);
        }
    }
    
    return res.render("blocked", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        referrerInfo: null,
        message: `Dostęp zabroniony. Powód: ${reason}`
    });
});

// Funkcja do sprawdzania, czy użytkownik jest zbanowany
async function isUserBlocked(user) {
    try {
        const BlockedUser = require('../database/models/BlockedUser');
        const blockedUser = await BlockedUser.findOne({ userId: user.id });
        return !!blockedUser;
    } catch (error) {
        console.error('Błąd przy sprawdzaniu zbanowanego użytkownika:', error);
        return false;
    }
}

module.exports = app;
