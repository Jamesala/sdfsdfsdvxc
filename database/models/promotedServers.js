const mongoose = require('mongoose');

const promotedServersSchema = new mongoose.Schema({
    imgSrc: {
        type: String, // URL do ikony serwera
        required: true
    },
    altText: {
        type: String, // Alternatywny tekst dla obrazu (np. nazwa serwera)
        required: true
    },
    serverLink: {
        type: String, // Link do strony serwera
        required: true
    },
    title: {
        type: String, // Tytuł/nazwa serwera
        required: true
    },
    userCountColor: {
        type: String, // Kolor licznika użytkowników (np. dla wyświetlania na stronie)
        required: false // Nie jest wymagane, jeśli chcesz zachować elastyczność
    },
    userCount: {
        type: String, // Liczba użytkowników (np. "2,500+")
        required: false
    },
    description: {
        type: String, // Krótki opis serwera
        required: true
    },
    badges: {
        type: [String], // Tablica odznak lub tagów związanych z serwerem
        required: false
    },
    backgroundImage: {
        type: String, // URL do tła dla promowanego serwera (jeśli istnieje)
        required: false,
        default: null
    }
});

module.exports = mongoose.model('PromotedServers', promotedServersSchema);
