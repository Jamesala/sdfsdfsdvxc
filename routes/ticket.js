const express = require('express');
const Ticket = require('../database/models/tickets/ticket');
const sanitizeHtml = require('sanitize-html');
const { body, validationResult } = require('express-validator');
const moment = require('moment-timezone');
require('moment/locale/pl');
moment.locale('pl');
moment.tz.setDefault('Europe/Warsaw');
const app = express.Router();

const bannedWords = ['kurwa', 'chuj', 'pizda', 'jebac', 'skurwysyn', 'dziwka', 'suka', 'pierdol', 'huj', 'debil', 'idiota'];

app.use(express.json());

// Middleware sprawdzający, czy użytkownik jest zalogowany
function isAuthenticated(req, res, next) {
    if (!req.user) {
        return res.render('404.ejs', {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            message: 'Musisz być zalogowany, aby wysłać zgłoszenie!'
        });
    }
    next();
}

console.success('[Tickets] /tickets router loaded.'.brightYellow);

// Trasy dla różnych typów zgłoszeń
app.get('/tickets', isAuthenticated, (req, res) => {
    res.render('tickets', {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
    });
});

// Uniwersalna trasa do przesyłania zgłoszeń z pełną walidacją
app.post('/tickets/submit', isAuthenticated, [
    body('type').isIn(['cooperation', 'server', 'help', 'bug']).withMessage('Nieprawidłowy typ zgłoszenia'),
    body('title')
        .trim()
        .isLength({ min: 5, max: 100 }).withMessage('Tytuł musi mieć od 5 do 100 znaków')
        .escape(),
    body('description')
        .trim()
        .isLength({ min: 10, max: 1000 }).withMessage('Opis musi mieć od 10 do 1000 znaków')
        .escape(),
    body('serverID')
        .if(body('type').equals('server'))
        .notEmpty().withMessage('ID Serwera jest wymagane dla zgłoszeń serwera')
        .isLength({ min: 17, max: 19 }).withMessage('ID Serwera musi mieć od 17 do 19 znaków')
        .isNumeric().withMessage('ID Serwera musi być liczbą'),
    body('discordID')
        .if(body('type').equals('cooperation'))
        .notEmpty().withMessage('ID Użytkownika jest wymagane dla zgłoszeń współpracy')
        .isLength({ min: 17, max: 19 }).withMessage('ID Użytkownika musi mieć od 17 do 19 znaków')
        .isNumeric().withMessage('ID Użytkownika musi być liczbą')
], async (req, res) => {
    try {
        // Sprawdzenie błędów walidacji
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array(),
                message: 'Popraw błędy w formularzu'
            });
        }

        let { type, title, description, discordID, serverID } = req.body;

        // 1. Rate limiting - sprawdź czy użytkownik nie utworzył ticketu w ciągu ostatnich 5 minut
        const recentTicket = await Ticket.findOne({
            userID: req.user.id,
            createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        });

        if (recentTicket) {
            return res.status(429).json({
                success: false,
                message: 'Musisz poczekać 5 minut przed utworzeniem kolejnego zgłoszenia.'
            });
        }

        // 2. Sprawdź liczbę aktywnych ticketów użytkownika (z atomic operation)
        const activeTicketsCount = await Ticket.countDocuments({
            userID: req.user.id,
            status: { $nin: ['resolved', 'rejected'] }
        });

        if (activeTicketsCount >= 2) {
            return res.status(400).json({
                success: false,
                message: 'Możesz mieć maksymalnie 2 otwarte zgłoszenia. Zamknij któreś z istniejących przed stworzeniem nowego.'
            });
        }

        // Dodatkowa sanityzacja HTML
        title = sanitizeHtml(title, { 
            allowedTags: [], 
            allowedAttributes: {},
            disallowedTagsMode: 'escape'
        }).trim();
        
        description = sanitizeHtml(description, { 
            allowedTags: [], 
            allowedAttributes: {},
            disallowedTagsMode: 'escape'
        }).trim();

        // Sprawdź ponownie długość po sanityzacji
        if (title.length < 5 || title.length > 100) {
            return res.status(400).json({ 
                success: false,
                message: 'Tytuł po sanityzacji musi mieć od 5 do 100 znaków'
            });
        }

        if (description.length < 10 || description.length > 1000) {
            return res.status(400).json({ 
                success: false,
                message: 'Opis po sanityzacji musi mieć od 10 do 1000 znaków'
            });
        }

        // 3. Sprawdzanie zakazanych słów (lepszy algorytm)
        const textToCheck = `${title} ${description}`.toLowerCase();
        const hasBannedWords = bannedWords.some(word => {
            const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'i');
            return regex.test(textToCheck);
        });

        if (hasBannedWords) {
            return res.status(400).json({ 
                success: false,
                message: 'Zgłoszenie zawiera niedozwoloną treść'
            });
        }

        // 3. Tworzenie nowego zgłoszenia
        const newTicket = new Ticket({
            type,
            title,
            description,
            discordID: type === 'cooperation' ? discordID : null,
            serverID: type === 'server' ? serverID : null,
            createdBy: req.user.username,
            userID: req.user.id,
            status: 'open'
        });

        await newTicket.save();

        // 4. Wysyłanie powiadomienia na Discord
        try {
            const channelID = global.config?.server?.channels?.comreport;
            if (channelID && global.client?.channels?.cache?.get(channelID)) {
                await global.client.channels.cache.get(channelID).send({
                    embeds: [{
                        title: `Nowe zgłoszenie: ${title.substring(0, 180)}...`, // Bezpieczne obcięcie
                        description: `**Typ:** ${type}\n**Zgłaszający:** <@${req.user.id}>\n\n${description.substring(0, 1800)}${description.length > 1800 ? '...' : ''}`,
                        color: 0x5024f3,
                        fields: [
                            { name: 'ID Zgłoszenia', value: newTicket._id.toString(), inline: true },
                            { name: 'Status', value: 'Otwarte', inline: true },
                            { name: 'Data utworzenia', value: moment().format('DD MMMM YYYY, HH:mm'), inline: true }
                        ],
                        timestamp: new Date()
                    }]
                });
            }
        } catch (discordError) {
            console.error('Błąd podczas wysyłania powiadomienia na Discord:', discordError);
            // Nie przerywamy procesu - zgłoszenie zostało zapisane
        }

        res.json({
            success: true,
            message: 'Zgłoszenie zostało pomyślnie wysłane!',
            ticketId: newTicket._id
        });

    } catch (error) {
        console.error('Błąd podczas zapisu zgłoszenia:', error);
        res.status(500).json({ 
            success: false,
            message: 'Wystąpił błąd przy zapisywaniu zgłoszenia',
            error: error.message 
        });
    }
});

// Pozostałe trasy pozostają bez zmian
app.get('/tickets/user', isAuthenticated, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100
        const skip = Math.max(parseInt(req.query.skip) || 0, 0);
        
        const tickets = await Ticket.find({ userID: req.user.id })
            .select('_id type title description status response respondedBy createdAt updatedAt')
            .sort({ updatedAt: -1, createdAt: -1 }) // Sortuj po ostatniej aktualizacji
            .skip(skip)
            .limit(limit)
            .lean();
        
        const formattedTickets = tickets.map(ticket => ({
            ...ticket,
            title: ticket.title || '',
            description: ticket.description || '',
            response: ticket.response || null,
            respondedBy: ticket.respondedBy || null,
            createdAt: ticket.createdAt.toISOString(),
            updatedAt: ticket.updatedAt.toISOString()
        }));
        
        res.json({
            success: true,
            tickets: formattedTickets,
            count: formattedTickets.length
        });
    } catch (error) {
        console.error('Błąd podczas pobierania zgłoszeń:', error);
        res.status(500).json({ 
            success: false,
            message: 'Wystąpił błąd przy pobieraniu zgłoszeń.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.get('/tickets/details/:ticketId', isAuthenticated, async (req, res) => {
    try {
        // Walidacja ID ticketu
        if (!req.params.ticketId || !/^[0-9a-fA-F]{24}$/.test(req.params.ticketId)) {
            return res.status(400).json({ 
                success: false,
                message: 'Nieprawidłowy identyfikator ticketu.' 
            });
        }

        const ticket = await Ticket.findById(req.params.ticketId).lean();
        
        if (!ticket) {
            return res.status(404).json({ 
                success: false,
                message: 'Zgłoszenie nie zostało znalezione.' 
            });
        }

        if (ticket.userID !== req.user.id) {
            return res.status(403).json({ 
                success: false,
                message: 'Brak uprawnień do wyświetlenia tego zgłoszenia.' 
            });
        }

        // Sanityzacja danych przed wysłaniem
        const sanitizedTicket = {
            ...ticket,
            title: ticket.title || '',
            description: ticket.description || '',
            response: ticket.response || null,
            respondedBy: ticket.respondedBy || null,
            createdAt: ticket.createdAt.toISOString(),
            updatedAt: ticket.updatedAt.toISOString()
        };

        res.json({
            success: true,
            ticket: sanitizedTicket
        });
    } catch (error) {
        console.error('Błąd podczas pobierania szczegółów zgłoszenia:', error);
        res.status(500).json({ 
            success: false,
            message: 'Wystąpił błąd przy pobieraniu szczegółów zgłoszenia.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.get('/tickets/server/:serverID', isAuthenticated, async (req, res) => {
    try {
        const tickets = await Ticket.find({ 
            serverID: req.params.serverID,
            type: 'server'
        }).sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        console.error('Błąd podczas pobierania zgłoszeń serwera:', error);
        res.status(500).json({ message: 'Wystąpił błąd przy pobieraniu zgłoszeń serwera.' });
    }
});

module.exports = app;