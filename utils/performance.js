
const logger = require('./logger');

class PerformanceMonitor {
    static trackRequest(req, res, next) {
        const start = Date.now();
        
        res.on('finish', () => {
            const duration = Date.now() - start;
            
            if (duration > 1000) { // Log slow requests
                logger.warn('Slow request detected', {
                    method: req.method,
                    url: req.originalUrl,
                    duration: `${duration}ms`,
                    statusCode: res.statusCode
                });
            }
            
            if (duration > 5000) { // Log very slow requests
                logger.error('Very slow request detected', {
                    method: req.method,
                    url: req.originalUrl,
                    duration: `${duration}ms`,
                    statusCode: res.statusCode
                });
            }
        });
        
        next();
    }
    
    static memoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: Math.round(usage.rss / 1024 / 1024),
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
            external: Math.round(usage.external / 1024 / 1024)
        };
    }
}

module.exports = PerformanceMonitor;
