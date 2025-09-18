const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const referralCodeSchema = new Schema({
  code: { type: String, required: true, unique: true }, // Unikalny kod
  userID: { type: String, required: true },           // ID użytkownika, który wygenerował kod
  isUsed: { type: Boolean, default: false },          // Status, czy kod został użyty
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ReferralCode', referralCodeSchema);
