const app = require("express").Router();
const Ticket = require("../../database/models/tickets/ticket");
const escapeHtml = require('escape-html'); // Added for XSS protection

console.log("[Dashboard] /tickets router loaded.".brightYellow);

// Middleware for authentication and authorization checks
const requireAdmin = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: null,
            req: req,
            message: "Musisz być zalogowany, aby wyświetlić tę stronę."
        });
    }
    
    if (!config.client.owners.includes(req.user.id)) {
        return res.status(403).render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.user,
            req: req,
            message: "Nie masz uprawnień do przeglądania tej strony."
        });
    }
    next();
};

// Input validation middleware
const validateTicketId = (req, res, next) => {
    if (!req.params.id || !/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
        return res.status(400).render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.user,
            req: req,
            message: "Nieprawidłowy identyfikator ticketu."
        });
    }
    next();
};

app.get("/dashboard/tickets", requireAdmin, async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        
        // Escape all ticket data to prevent XSS
        const safeTickets = tickets.map(ticket => ({
            ...ticket._doc,
            title: escapeHtml(ticket.title),
            description: escapeHtml(ticket.description),
            status: escapeHtml(ticket.status),
            response: ticket.response ? escapeHtml(ticket.response) : null,
            respondedBy: ticket.respondedBy ? escapeHtml(ticket.respondedBy) : null
        }));

        res.render("dashboard/tickets", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.user,
            req: req,
            tickets: safeTickets,
            moment: require("moment"),
            escapeHtml // Make escapeHtml available in views
        });
    } catch (error) {
        console.error(error);
        res.status(500).render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.user,
            req: req,
            message: "Wystąpił błąd podczas ładowania ticketów."
        });
    }
});

app.get("/dashboard/tickets/delete/:id", requireAdmin, validateTicketId, async (req, res) => {
    try {
        const ticket = await Ticket.findByIdAndDelete(req.params.id);
        if (!ticket) {
            return res.status(404).render("404", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.user,
                req: req,
                message: "Ticket nie znaleziony."
            });
        }
        res.redirect("/dashboard/tickets");
    } catch (error) {
        console.error(error);
        res.status(500).render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.user,
            req: req,
            message: "Błąd podczas usuwania ticketu."
        });
    }
});

app.post("/dashboard/tickets/update/:id", requireAdmin, validateTicketId, async (req, res) => {
    try {
        const { status, response } = req.body;
        
        // Input validation
        if (!status || !['open', 'in_progress', 'resolved', 'rejected'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: "Nieprawidłowy status ticketu" 
            });
        }
        
        if (typeof response !== 'string' || response.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Odpowiedź nie może być pusta" 
            });
        }
        
        if (response.length > 1000) {
            return res.status(400).json({ 
                success: false, 
                message: "Odpowiedź musi mieć maksymalnie 1000 znaków" 
            });
        }

        const ticket = await Ticket.findByIdAndUpdate(req.params.id, {
            status,
            response: escapeHtml(response), // Sanitize response
            respondedBy: escapeHtml(req.user.username), // Sanitize username
            updatedAt: new Date() // Wymuszenie aktualizacji timestamp
        }, { new: true, runValidators: true });

        if (!ticket) {
            return res.status(404).json({ 
                success: false, 
                message: "Ticket nie znaleziony" 
            });
        }

        res.json({ 
            success: true, 
            message: "Ticket zaktualizowany", 
            ticket: {
                ...ticket._doc,
                response: escapeHtml(ticket.response),
                respondedBy: escapeHtml(ticket.respondedBy)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: "Błąd serwera" 
        });
    }
});

module.exports = app;