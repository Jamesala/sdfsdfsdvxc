const fs = require('fs');
const path = require('path');
const util = require('util');
const chalk = require('chalk');
const moment = require('moment');
const { WebhookClient } = require('discord.js');

class Logger {
    constructor(options = {}) {
        // Default options
        this.options = {
            logLevel: process.env.LOG_LEVEL || 'debug', // 'error', 'warn', 'info', 'debug', 'silly'
            logToFile: process.env.LOG_TO_FILE === 'true' || false,
            logDirectory: process.env.LOG_DIR || path.join(__dirname, '../logs'),
            logFileName: process.env.LOG_FILE_NAME || 'application.log',
            discordWebhook: process.env.DISCORD_WEBHOOK_URL || null,
            discordWebhookLevels: ['error', 'warn'], // Which levels should trigger Discord alerts
            ...options
        };

        // Create log directory if it doesn't exist
        if (this.options.logToFile && !fs.existsSync(this.options.logDirectory)) {
            fs.mkdirSync(this.options.logDirectory, { recursive: true });
        }

        // Initialize Discord webhook if configured
        if (this.options.discordWebhook) {
            this.discordWebhook = new WebhookClient({ url: this.options.discordWebhook });
        }

        // Define log levels and colors
        this.levels = {
            error: { priority: 0, color: chalk.red },
            warn: { priority: 1, color: chalk.yellow },
            info: { priority: 2, color: chalk.blue },
            debug: { priority: 3, color: chalk.green },
            silly: { priority: 4, color: chalk.magenta }
        };

        // Bind methods to ensure correct 'this' context
        this.error = this.error.bind(this);
        this.warn = this.warn.bind(this);
        this.info = this.info.bind(this);
        this.debug = this.debug.bind(this);
        this.silly = this.silly.bind(this);
        this.log = this.log.bind(this);
    }

    /**
     * Main logging method
     * @param {string} level - Log level
     * @param {string} message - Message to log
     * @param {object} [metadata] - Additional metadata
     */
    log(level, message, metadata = {}) {
        // Check if logging is enabled for this level
        if (this.levels[level].priority > this.levels[this.options.logLevel].priority) {
            return;
        }

        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss.SSS');
        const formattedMessage = typeof message === 'object' 
            ? util.inspect(message, { depth: null, colors: true })
            : message;

        // Format the log entry
        const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${formattedMessage}` +
            (Object.keys(metadata).length > 0 ? ` | ${util.inspect(metadata, { depth: null })}` : '');

        // Colorize console output
        const coloredLogEntry = this.levels[level].color(logEntry);

        // Output to console
        console.log(coloredLogEntry);

        // Write to file if enabled
        if (this.options.logToFile) {
            const logFilePath = path.join(this.options.logDirectory, this.options.logFileName);
            fs.appendFileSync(logFilePath, logEntry + '\n', 'utf8');
        }

        // Send to Discord webhook if configured for this level
        if (this.discordWebhook && this.options.discordWebhookLevels.includes(level)) {
            this.sendToDiscord(level, message, metadata).catch(err => {
                console.error('Failed to send log to Discord:', err);
            });
        }
    }

    /**
     * Send log to Discord webhook
     * @private
     */
    async sendToDiscord(level, message, metadata = {}) {
        if (!this.discordWebhook) return;

        const embed = {
            title: `🚨 ${level.toUpperCase()} Alert`,
            description: `**Message**: ${message}`,
            color: level === 'error' ? 0xFF0000 : 0xFFFF00,
            timestamp: new Date(),
            fields: []
        };

        if (Object.keys(metadata).length > 0) {
            for (const [key, value] of Object.entries(metadata)) {
                embed.fields.push({
                    name: key,
                    value: typeof value === 'object' 
                        ? '```json\n' + JSON.stringify(value, null, 2) + '\n```'
                        : String(value),
                    inline: false
                });
            }
        }

        try {
            await this.discordWebhook.send({
                username: 'Server Logger',
                avatarURL: 'https://cdn.discordapp.com/emojis/753932924821438534.png',
                embeds: [embed]
            });
        } catch (err) {
            console.error('Discord webhook error:', err);
        }
    }

    /**
     * Log error messages
     * @param {string} message - Error message
     * @param {object} [metadata] - Additional metadata
     */
    error(message, metadata = {}) {
        this.log('error', message, metadata);
    }

    /**
     * Log warning messages
     * @param {string} message - Warning message
     * @param {object} [metadata] - Additional metadata
     */
    warn(message, metadata = {}) {
        this.log('warn', message, metadata);
    }

    /**
     * Log info messages
     * @param {string} message - Info message
     * @param {object} [metadata] - Additional metadata
     */
    info(message, metadata = {}) {
        this.log('info', message, metadata);
    }

    /**
     * Log debug messages
     * @param {string} message - Debug message
     * @param {object} [metadata] - Additional metadata
     */
    debug(message, metadata = {}) {
        this.log('debug', message, metadata);
    }

    /**
     * Log silly messages (lowest priority)
     * @param {string} message - Silly message
     * @param {object} [metadata] - Additional metadata
     */
    silly(message, metadata = {}) {
        this.log('silly', message, metadata);
    }

    /**
     * Log HTTP requests
     * @param {object} req - Express request object
     * @param {object} res - Express response object
     * @param {object} [metadata] - Additional metadata
     */
    http(req, res, metadata = {}) {
        const message = `${req.method} ${req.originalUrl} ${res.statusCode}`;
        const httpMetadata = {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            userId: req.user?.id || 'anonymous',
            responseTime: res.get('X-Response-Time'),
            ...metadata
        };

        if (res.statusCode >= 500) {
            this.error(message, httpMetadata);
        } else if (res.statusCode >= 400) {
            this.warn(message, httpMetadata);
        } else {
            this.info(message, httpMetadata);
        }
    }

    /**
     * Log database queries
     * @param {string} query - Database query
     * @param {number} time - Execution time in ms
     * @param {object} [metadata] - Additional metadata
     */
    db(query, time, metadata = {}) {
        const message = `DB query executed in ${time}ms`;
        this.debug(message, { query, ...metadata });
    }
}

// Create a singleton instance
const logger = new Logger();

module.exports = logger;