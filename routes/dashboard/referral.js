// routes/dashboard/referral.js
const express = require('express');
const router = express.Router();
const Profile = require('../../database/models/profile');

console.success("[Referral] /dashboard/referral.js router loaded.".brightYellow);

// Funkcja do logowania zmian punktów
async function logPointsChange(action, moderator, targetUser, amount, reason) {
    if (!global.client || !global.config.server.channels.reflog) return;
    
    try {
        const actionColor = action === 'ADD' ? 0x2ecc71 : 0xe74c3c; // Zielony dla dodania, czerwony dla odjęcia
        const actionEmoji = action === 'ADD' ? '➕' : '➖';

        await global.client.channels.cache.get(global.config.server.channels.reflog).send({
            embeds: [{
                color: actionColor,
                title: `${actionEmoji} Punkty ${action === 'ADD' ? 'dodane' : 'odjęte'}`,
                fields: [
                    { name: 'Moderator', value: `<@${moderator.id}> (${moderator.username})`, inline: true },
                    { name: 'Użytkownik', value: `<@${targetUser.id}> (${targetUser.username || targetUser.id})`, inline: true },
                    { name: 'Ilość punktów', value: amount.toString(), inline: true },
                    { name: 'Akcja', value: action === 'ADD' ? 'Dodanie' : 'Odjęcie', inline: true },
                    { name: 'Powód', value: reason || 'Brak podanego powodu', inline: false }
                ],
                timestamp: new Date()
            }]
        });
    } catch (e) {
        console.error('Błąd podczas logowania zmiany punktów:', e);
    }
}

// Referral Dashboard
router.route("/dashboard/referral")
    .get(async (req, res) => {
        if (!req.isAuthenticated()) return res.render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: null,
            req: req,
            message: "Musisz być zalogowany, aby przeglądać panel referencji."
        });

        // Check permissions
        const guild = global.client.guilds.cache.get(config.server.id);
        if (!guild) throw new Error("Guild not found");

        const member = await guild.members.fetch(req.user.id).catch(() => null);
        if (!member) return res.render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.user,
            req: req,
            message: "Nie jesteś członkiem serwera Discord."
        });

        const hasAccess = config.client.owners.includes(req.user.id) || 
                         member.roles.cache.has(config.server.roles.botReviewer);
        
        if (!hasAccess) return res.render("404", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.user,
            req: req,
            message: "Nie masz dostępu do tej strony."
        });

        try {
            // Get all referral data with pagination
            const page = parseInt(req.query.page) || 1;
            const limit = 25;
            const skip = (page - 1) * limit;

            const [profiles, total] = await Promise.all([
                Profile.find({ 
                    $or: [
                        { referralCount: { $gt: 0 } }, 
                        { points: { $gt: 0 } },
                        { 'transactions.0': { $exists: true } },
                        { referralCode: { $exists: true } }
                    ] 
                })
                    .sort({ points: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Profile.countDocuments({ 
                    $or: [
                        { referralCount: { $gt: 0 } }, 
                        { points: { $gt: 0 } },
                        { 'transactions.0': { $exists: true } },
                        { referralCode: { $exists: true } }
                    ] 
                })
            ]);

            // Calculate potential fraud indicators
            const profilesWithFraudIndicators = profiles.map(profile => {
                const transactions = profile.transactions || [];
                const suspiciousTransactions = transactions.filter(t => 
                    t.amount > 100 || // Large transactions
                    (t.type === 'earn' && t.amount % 10 === 0) || // Round numbers
                    (new Date() - new Date(t.date) < 86400000 && t.amount > 50) // Large amounts in short time
                );

                return {
                    ...profile,
                    isSuspicious: suspiciousTransactions.length > 0,
                    suspiciousTransactions,
                    totalEarned: transactions.reduce((sum, t) => t.type === 'earn' ? sum + t.amount : sum, 0),
                    totalRedeemed: transactions.reduce((sum, t) => t.type === 'redeem' ? sum + t.amount : sum, 0),
                    // Ensure required fields exist
                    points: profile.points || 0,
                    referralCount: profile.referralCount || 0,
                    referralCode: profile.referralCode || 'N/A',
                    userTasks: profile.userTasks || { youtubeSubscribed: false, discordJoined: false, sharedServer: false },
                    partnerBonuses: profile.partnerBonuses || { pointsPerYoutube: 10, pointsPerDiscord: 10, pointsPerServer: 10 }
                };
            });

            res.render("dashboard/referral", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.user,
                req: req,
                profiles: profilesWithFraudIndicators,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                sbot: global.client
            });

        } catch (e) {
            console.error("[Referral Route Error]", e);
            return res.render("500", {
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
                message: "Wystąpił błąd serwera podczas przetwarzania żądania."
            });
        }
    });

// Update user points
router.route("/dashboard/referral/update")
    .post(async (req, res) => {
        if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

        try {
            const { userID, action, amount, reason } = req.body;
            if (!userID || !action || !amount || isNaN(amount)) {
                return res.status(400).json({ error: "Invalid parameters" });
            }

            const profile = await Profile.findOne({ userID });
            if (!profile) return res.status(404).json({ error: "Profile not found" });

            const numAmount = parseInt(amount);
            const transaction = {
                type: action,
                amount: numAmount,
                date: new Date(),
                details: reason || `Regulacja przez administratora ${req.user.username}`,
                moderator: req.user.id
            };

            if (action === 'earn') {
                profile.points += numAmount;
                // Logowanie dodania punktów
                await logPointsChange(
                    'ADD',
                    { id: req.user.id, username: req.user.username },
                    { id: userID, username: profile.username || userID },
                    numAmount,
                    reason
                );
            } else if (action === 'redeem') {
                if (profile.points < numAmount) {
                    return res.status(400).json({ error: "Not enough points" });
                }
                profile.points -= numAmount;
                // Logowanie odjęcia punktów
                await logPointsChange(
                    'REMOVE',
                    { id: req.user.id, username: req.user.username },
                    { id: userID, username: profile.username || userID },
                    numAmount,
                    reason
                );
            }

            profile.transactions.push(transaction);
            await profile.save();

            res.json({ success: true, newBalance: profile.points });

        } catch (e) {
            console.error("[Referral Update Error]", e);
            res.status(500).json({ error: "Server error" });
        }
    });

// Reset referral code
router.route("/dashboard/referral/reset-code")
    .post(async (req, res) => {
        if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

        try {
            const { userID } = req.body;
            if (!userID) return res.status(400).json({ error: "User ID required" });

            const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            await Profile.updateOne({ userID }, { referralCode: newCode });

            res.json({ success: true, newCode });

        } catch (e) {
            console.error("[Referral Reset Code Error]", e);
            res.status(500).json({ error: "Server error" });
        }
    });
	
	// Add this route before module.exports
router.route("/dashboard/referral/transactions")
    .get(async (req, res) => {
        if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

        try {
            const { userID } = req.query;
            if (!userID) return res.status(400).json({ error: "User ID required" });

            const profile = await Profile.findOne({ userID }).lean();
            if (!profile) return res.status(404).json({ error: "Profile not found" });

            res.json({ 
                success: true, 
                profile: {
                    transactions: profile.transactions || [],
                    userID: profile.userID,
                    username: profile.username
                }
            });

        } catch (e) {
            console.error("[Transactions Route Error]", e);
            res.status(500).json({ error: "Server error" });
        }
    });

module.exports = router;