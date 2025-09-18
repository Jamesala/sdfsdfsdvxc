
const mongoose = require('mongoose');

const BadgeLevelSchema = new mongoose.Schema({
  level: { type: Number, required: true },
  name: { type: String, required: true }, // np. "Brązowy", "Srebrny", "Złoty"
  description: { type: String, required: true },
  imageUrl: { type: String, required: true },
  requiredValue: { type: Number, required: true }, // wartość wymagana dla tego poziomu
  color: { type: String, default: '#6d5bff' }
});

const BadgeSchema = new mongoose.Schema({
  name: { type: String, required: true }, // główna nazwa odznaki np. "Recenzent"
  description: { type: String, required: true }, // ogólny opis odznaki
  category: { type: String, required: true }, // kategoria np. "reviews", "bumps", "servers"
  imageUrl: { type: String, default: 'https://cdn.discordapp.com/attachments/000000000000000000/default-badge.png' },
  color: { type: String, default: '#6d5bff' },
  rarity: { type: String, enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'], default: 'common' },
  requirements: {
    type: { type: String, enum: ['bumps', 'reviews', 'joinDate', 'referrals', 'servers', 'manual'], required: true },
    operator: { type: String, enum: ['>=', '>', '=', '<', '<='], default: '>=' },
    value: { type: Number } // wartość wymagana dla prostych odznak
  },
  levels: [BadgeLevelSchema], // różne poziomy odznaki
  isActive: { type: Boolean, default: true },
  isLevelBased: { type: Boolean, default: false } // czy odznaka ma poziomy
}, { timestamps: true });

const UserBadgeSchema = new mongoose.Schema({
  userID: { type: String, required: true },
  badgeID: { type: mongoose.Schema.Types.ObjectId, ref: 'Badge', required: true },
  currentLevel: { type: Number, default: 1 }, // aktualny poziom odznaki
  currentValue: { type: Number, default: 0 }, // aktualna wartość użytkownika
  earnedAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  isVisible: { type: Boolean, default: true },
  awardedManually: { type: Boolean, default: false },
  awardedBy: { type: String, default: null }
}, { timestamps: true });

// Indeksy dla wydajności
BadgeSchema.index({ isActive: 1, isLevelBased: 1 });
BadgeSchema.index({ 'requirements.type': 1 });
UserBadgeSchema.index({ userID: 1 });
UserBadgeSchema.index({ badgeID: 1 });
UserBadgeSchema.index({ userID: 1, badgeID: 1 }, { unique: true });

module.exports = {
  Badge: mongoose.model('Badge', BadgeSchema),
  UserBadge: mongoose.model('UserBadge', UserBadgeSchema)
};
