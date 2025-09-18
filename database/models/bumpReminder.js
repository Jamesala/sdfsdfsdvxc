
const mongoose = require('mongoose');

const bumpReminderSchema = new mongoose.Schema({
    serverID: { type: String, required: true },
    userID: { type: String, required: true },
    reminderType: { type: String, enum: ['server', 'bot'], required: true },
    botID: { type: String }, // Tylko dla przypomnień botów
    scheduledTime: { type: Date, required: true },
    channelID: { type: String, required: true },
    isExecuted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Index dla szybkiego wyszukiwania aktywnych przypomnień
bumpReminderSchema.index({ scheduledTime: 1, isExecuted: 1 });

module.exports = mongoose.model('BumpReminder', bumpReminderSchema);
