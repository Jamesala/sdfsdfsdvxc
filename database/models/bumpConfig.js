const mongoose = require('mongoose');

const bumpConfigSchema = new mongoose.Schema({
    serverID: { type: String, required: true }, // ID serwera
    enabled: { type: Boolean, default: false }, // Czy przypomnienia są włączone (domyślnie wyłączone)
    reminderChannelId: { type: String, default: null } // ID kanału do przypomnień
});

module.exports = mongoose.model('BumpConfig', bumpConfigSchema);
