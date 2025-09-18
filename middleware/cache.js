// middlewares/cache.js
const Redis = require('ioredis');
const redis = new Redis();

module.exports.cacheMiddleware = (ttl) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();
    
    const cacheKey = `page:${req.originalUrl}`;
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.send(cached);
      }

      const originalSend = res.send;
      res.send = (body) => {
        if (res.statusCode === 200) {
          redis.setex(cacheKey, ttl, body)
            .catch(err => console.error('Cache set error:', err));
        }
        originalSend.call(res, body);
      };

      next();
    } catch (err) {
      console.error('Cache middleware error:', err);
      next();
    }
  };
};