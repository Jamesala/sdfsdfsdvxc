const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['cooperation', 'server', 'help', 'bug'] // Typy zgłoszeń
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    discordID: {
        type: String,
        default: null
    },
    serverID: {
        type: String,
        default: null
    },
    createdBy: {
        type: String,
        required: true
    },
    userID: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'open',
        enum: ['open', 'in_progress', 'resolved', 'rejected']
    },
    response: {
        type: String,
        default: null
    },
    respondedBy: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Dodaj indeksy dla lepszej wydajności
ticketSchema.index({ userID: 1, status: 1 });
ticketSchema.index({ userID: 1, createdAt: -1 });
ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ type: 1, createdAt: -1 });

const Ticket = mongoose.model('Ticket', ticketSchema);
module.exports = Ticket;