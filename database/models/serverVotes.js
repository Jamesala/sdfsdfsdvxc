const mongoose = require('mongoose');

const serverVotesSchema = new mongoose.Schema({
    userID: { type: String, required: true }, // Discord user ID
    serverID: { type: String, required: true }, // Discord server ID
    bumpCount: { type: Number, default: 0 }, // Number of bumps by the user
    Date: { type: Date, default: Date.now } // Last bump timestamp
});

module.exports = mongoose.model('serverVotes', serverVotesSchema);
