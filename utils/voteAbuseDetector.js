// utils/voteAbuseDetector.js
const moment = require('moment');

class VoteAbuseDetector {
    constructor() {
        this.votePatterns = new Map(); // Przechowuje wzorce głosowań
        this.suspiciousThreshold = 10; // Próg podejrzanych głosów w okresie czasu
        this.timeWindow = 5 * 60 * 1000; // 5 minut w milisekundach
    }

    async checkForAbuse(botId, userId, ip) {
        try {
            // Sprawdź czy w ostatnim czasie było wiele głosów na tego bota
            const recentVotes = await votes.countDocuments({
                botID: botId,
                Date: { $gt: Date.now() - this.timeWindow }
            });

            // Sprawdź czy ten sam IP głosował na wielu różnych botów
            const votesFromSameIP = await votes.countDocuments({
                ip: ip,
                Date: { $gt: Date.now() - this.timeWindow },
                botID: { $ne: botId } // różne boty
            });

            // Sprawdź czy użytkownik głosował na wielu różnych botów
            const userVotesOnDifferentBots = await votes.countDocuments({
                userID: userId,
                Date: { $gt: Date.now() - this.timeWindow },
                botID: { $ne: botId } // różne boty
            });

            // Flagi podejrzanych zachowań
            const flags = [];

            if (recentVotes >= this.suspiciousThreshold) {
                flags.push(`Zbyt wiele głosów (${recentVotes}) na tego bota w krótkim czasie`);
            }

            if (votesFromSameIP >= 3) {
                flags.push(`To samo IP (${ip}) głosowało na ${votesFromSameIP} różnych botów`);
            }

            if (userVotesOnDifferentBots >= 3) {
                flags.push(`Użytkownik ${userId} głosował na ${userVotesOnDifferentBots} różnych botów`);
            }

            return {
                isSuspicious: flags.length > 0,
                reasons: flags
            };
        } catch (error) {
            console.error('Błąd podczas sprawdzania nadużyć:', error);
            return {
                isSuspicious: false,
                reasons: []
            };
        }
    }
}

module.exports = new VoteAbuseDetector();