const mongoose = require("mongoose");

// Define the schema for analytics
let analyticsSchema = new mongoose.Schema({
    serverID: { type: String, required: true }, // The server ID being tracked
    visits: { type: Number, default: 0 },      // Total number of page visits
    totalTimeSpent: { type: Number, default: 0 }, // Optional: Total time spent on the server page (in milliseconds)
    lastVisit: { type: Date, default: Date.now }, // Date of the last visit
});

// Export the model
module.exports = mongoose.model("analytics", analyticsSchema);
