const mongoose = require('mongoose');

const ReferralTransaction = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['earn', 'redeem', 'reward', 'task'], // Dodano 'task' dla zadań
    default: 'earn' 
  },
  amount: { type: Number, default: 0 },
  date: { type: Date, default: Date.now },
  details: { type: String, default: '' }
}, { _id: false });

const UserReward = new mongoose.Schema({
  type: { type: String, required: true },
  dateClaimed: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  isUsed: { type: Boolean, default: false }
}, { _id: false });

const UserProfile = new mongoose.Schema({
  userID: { type: String, required: true },
  biography: { type: String, default: null },
  points: { type: Number, default: 0 },
  referralCode: { 
    type: String, 
    default: function() {
      return Math.random().toString(36).substring(2, 8).toUpperCase();
    }
  },
  referredBy: { type: String, default: null },
  hasUsedReferral: { type: Boolean, default: false },
  referralCount: { type: Number, default: 0 },
  transactions: [{
        type: { type: String, required: true }, // 'earn' lub 'spend'
        amount: { type: Number, required: true },
        details: { type: String, required: true },
        date: { type: Date, default: Date.now }
    }],

    embedTemplates: [{
        name: { type: String, required: true, maxlength: 50 },
        embedData: { type: mongoose.Schema.Types.Mixed, required: true },
        createdAt: { type: Date, default: Date.now }
    }],

  // Sekcja zadań
  userTasks: {
    youtubeSubscribed: { 
      type: Boolean, 
      default: false 
    },
    discordJoined: { 
      type: Boolean, 
      default: false 
    },
    sharedServer: { 
      type: Boolean, 
      default: false 
    }
  },

  // Konfiguracja nagród
  partnerBonuses: {
    pointsPerServer: { type: Number, default: 10 },
    pointsPerYoutube: { type: Number, default: 10 },
    pointsPerDiscord: { type: Number, default: 10 },
    pointsPerShare: { type: Number, default: 15 },
    isPartner: { type: Boolean, default: false }
  },

  // Statystyki
  stats: {
    tasksCompleted: { type: Number, default: 0 }
  }
}, { timestamps: true });

// Indeksy dla lepszej wydajności
UserProfile.index({ userID: 1 });
UserProfile.index({ referralCode: 1 });

module.exports = mongoose.model('profiles', UserProfile);