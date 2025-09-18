const redis = global.redis;
const axios = require('axios');

module.exports = {
    clearHomepageCache: async (serverID) => {
        try {
            // Usuń cache strony głównej
            const keys = await redis.keys('homepage:*');
            if (keys.length > 0) {
                await redis.del(keys);
            }
            
            // Usuń cache informacji o serwerze
            await redis.del(`server_info:${serverID}`);
            
            // Opcjonalnie: wywołaj endpoint do odświeżenia statystyk
            try {
                await axios.post(`${global.config.website.url}/api/clear-cache/${serverID}`);
            } catch (apiErr) {
                console.error('API cache clear error:', apiErr.message);
            }
            
            console.log(`Cleared cache for server ${serverID}`);
            return true;
        } catch (err) {
            console.error('Cache clearing error:', err);
            return false;
        }
    }
};