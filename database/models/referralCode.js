const mongoose = require("mongoose");

const referenceSchema = new mongoose.Schema({
    referrerID: { type: String, required: true }, // ID użytkownika, który poleca
    referredID: { type: String, required: true }, // ID poleconego użytkownika
    timestamp: { type: Date, default: Date.now }, // Czas utworzenia referencji
});

module.exports = mongoose.model("Reference", referenceSchema);
