
const BlockedUser = require('../database/models/BlockedUser');

async function checkIfBlocked(req, res, next) {
    if (req.user) {
        try {
            // Sprawdzanie, czy użytkownik znajduje się na liście zbanowanych w bazie danych
            const blockedUser = await BlockedUser.findOne({ userId: req.user.id });

            if (blockedUser) {
                // Logowanie próby dostępu zablokowanego użytkownika
                console.log(`Zablokowany użytkownik ${req.user.id} próbował uzyskać dostęp do ${req.path}`);
                
                // Jeśli użytkownik jest zablokowany, przekierowujemy go na stronę blokady
                if (req.flash) {
                    req.flash('error', `Dostęp zabroniony. Powód: ${blockedUser.reason}`);
                }
                return res.redirect('/blocked');
            }
        } catch (error) {
            console.error('Błąd przy sprawdzaniu zbanowanego użytkownika:', error);
            // Nie blokujemy dostępu w przypadku błędu bazy danych
            console.warn('Kontynuowanie bez sprawdzenia bana z powodu błędu bazy danych');
        }
    }
    next();
}

module.exports = checkIfBlocked;
