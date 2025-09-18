const mongoose = require('mongoose');

const apiKeysSchema = new mongoose.Schema({
  userID: { type: String, required: true },
  key: { type: String, required: true, unique: true },
  dailyLimit: { type: Number, default: 1000 },
  usageCount: { type: Number, default: 0 },
  lastReset: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  permissions: { 
    bots: { type: Boolean, default: true },
    servers: { type: Boolean, default: true },
    votes: { type: Boolean, default: true },
    status: { type: Boolean, default: true }
  },
  whitelist: {
    ips: [{ type: String }],
    endpoints: [{ type: String }]
  },
  blacklist: {
    ips: [{ type: String }],
    endpoints: [{ type: String }]
  }
});

// Automatyczne resetowanie licznika użyć
apiKeysSchema.pre('save', function(next) {
  const now = new Date();
  const lastReset = this.lastReset || this.createdAt;
  
  if (now.toDateString() !== lastReset.toDateString()) {
    this.usageCount = 0;
    this.lastReset = now;
  }
  next();
});

// Metody statyczne
apiKeysSchema.statics = {
  async validateKey(key, endpoint, ip) {
    try {
      const apiKey = await this.findOne({ key });
      if (!apiKey) return { valid: false, reason: 'Nieprawidłowy klucz API' };
      
      // Sprawdzenie limitów
      if (apiKey.usageCount >= apiKey.dailyLimit) {
        return { valid: false, reason: 'Przekroczono dzienny limit' };
      }
      
      // Whitelist IP
      if (apiKey.whitelist.ips.length > 0 && !apiKey.whitelist.ips.includes(ip)) {
        return { valid: false, reason: 'IP nie znajduje się na whitelist' };
      }
      
      // Blacklist IP
      if (apiKey.blacklist.ips.includes(ip)) {
        return { valid: false, reason: 'IP znajduje się na blacklist' };
      }
      
      // Whitelist endpointów
      if (apiKey.whitelist.endpoints.length > 0 && 
          !apiKey.whitelist.endpoints.some(e => endpoint.startsWith(e))) {
        return { valid: false, reason: 'Endpoint nie znajduje się na whitelist' };
      }
      
      // Blacklist endpointów
      if (apiKey.blacklist.endpoints.some(e => endpoint.startsWith(e))) {
        return { valid: false, reason: 'Endpoint znajduje się na blacklist' };
      }
      
      // Sprawdzenie uprawnień
      const endpointCategory = endpoint.split('/')[2];
      if (endpointCategory === 'bots' && !apiKey.permissions.bots) {
        return { valid: false, reason: 'Brak uprawnień do endpointów botów' };
      }
      if (endpointCategory === 'servers' && !apiKey.permissions.servers) {
        return { valid: false, reason: 'Brak uprawnień do endpointów serwerów' };
      }
      if (endpoint.includes('/votes') && !apiKey.permissions.votes) {
        return { valid: false, reason: 'Brak uprawnień do endpointów głosów' };
      }
      if (endpoint.includes('/status') && !apiKey.permissions.status) {
        return { valid: false, reason: 'Brak uprawnień do endpointów statusu' };
      }
      
      // Zwiększenie licznika użyć
      apiKey.usageCount += 1;
      await apiKey.save();
      
      return { valid: true, userID: apiKey.userID };
    } catch (err) {
      console.error('Błąd walidacji klucza API:', err);
      return { valid: false, reason: 'Wewnętrzny błąd serwera' };
    }
  },
  
  async createKey(userID, options = {}) {
    try {
      const crypto = require('crypto');
      const key = `sk-${crypto.randomBytes(16).toString('hex')}`;
      
      const newKey = new this({
        userID,
        key,
        dailyLimit: options.dailyLimit || 1000,
        permissions: options.permissions || {
          bots: true,
          servers: true,
          votes: true,
          status: true
        },
        whitelist: options.whitelist || { ips: [], endpoints: [] },
        blacklist: options.blacklist || { ips: [], endpoints: [] }
      });
      
      await newKey.save();
      return { success: true, key };
    } catch (err) {
      console.error('Błąd tworzenia klucza API:', err);
      return { success: false, error: 'Nie udało się wygenerować klucza' };
    }
  }
};

module.exports = mongoose.model('apiKeys', apiKeysSchema);