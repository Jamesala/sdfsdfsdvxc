const mongoose = require('mongoose');

const roleConfigSchema = new mongoose.Schema({
    serverID: { type: String, required: true },
    bumpThresholds: [
        {
            count: { type: Number, required: true },
            roleId: { type: String, required: true }
        }
    ]
});

module.exports = mongoose.model('RoleConfig', roleConfigSchema);
