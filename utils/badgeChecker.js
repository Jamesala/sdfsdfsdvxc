
const { Badge, UserBadge } = require('../database/models/badge');

/**
 * Sprawdza i aktualizuje poziomy odznak dla użytkownika
 * @param {string} userID - ID użytkownika
 * @returns {Promise<Array>} - Lista zaktualizowanych/nowych odznak
 */
async function checkAndAwardBadges(userID) {
    try {
        const badges = await Badge.find({ isActive: true });
        const updatedBadges = [];

        for (const badge of badges) {
            if (badge.isLevelBased) {
                const result = await checkAndUpdateLevelBadge(userID, badge);
                if (result) {
                    updatedBadges.push(result);
                }
            } else {
                // Stary system dla odznak bez poziomów
                const result = await checkSingleBadge(userID, badge);
                if (result) {
                    updatedBadges.push(result);
                }
            }
        }

        return updatedBadges;
    } catch (error) {
        console.error('[BADGES] Error checking badges for user:', userID, error);
        return [];
    }
}

/**
 * Sprawdza i aktualizuje odznakę opartą na poziomach
 */
async function checkAndUpdateLevelBadge(userID, badge) {
    try {
        const currentValue = await getUserValueForBadgeType(userID, badge.requirements.type);
        
        // Znajdź najwyższy poziom, który użytkownik może osiągnąć
        const availableLevels = badge.levels
            .filter(level => currentValue >= level.requiredValue)
            .sort((a, b) => b.level - a.level); // sortuj od najwyższego

        if (availableLevels.length === 0) {
            return null; // użytkownik nie spełnia wymagań dla żadnego poziomu
        }

        const targetLevel = availableLevels[0];
        
        // Sprawdź czy użytkownik już ma tę odznakę
        let userBadge = await UserBadge.findOne({
            userID: userID,
            badgeID: badge._id
        });

        if (!userBadge) {
            // Przyznaj nową odznakę
            userBadge = new UserBadge({
                userID: userID,
                badgeID: badge._id,
                currentLevel: targetLevel.level,
                currentValue: currentValue
            });
            await userBadge.save();
            
            console.log(`[BADGES] Przyznano nową odznakę "${badge.name}" poziom ${targetLevel.level} użytkownikowi ${userID}`);
            
            return {
                badge: badge,
                userBadge: userBadge,
                level: targetLevel,
                isNew: true
            };
        } else if (userBadge.currentLevel < targetLevel.level) {
            // Ulepsz odznakę
            const oldLevel = userBadge.currentLevel;
            userBadge.currentLevel = targetLevel.level;
            userBadge.currentValue = currentValue;
            userBadge.lastUpdated = new Date();
            await userBadge.save();
            
            console.log(`[BADGES] Ulepszono odznakę "${badge.name}" z poziomu ${oldLevel} na ${targetLevel.level} dla użytkownika ${userID}`);
            
            return {
                badge: badge,
                userBadge: userBadge,
                level: targetLevel,
                isNew: false,
                isUpgrade: true,
                oldLevel: oldLevel
            };
        } else {
            // Aktualizuj tylko wartość
            userBadge.currentValue = currentValue;
            userBadge.lastUpdated = new Date();
            await userBadge.save();
        }

        return null;
    } catch (error) {
        console.error('[BADGES] Error checking level badge:', error);
        return null;
    }
}

/**
 * Sprawdza pojedynczą odznakę (stary system)
 */
async function checkSingleBadge(userID, badge) {
    try {
        const existingBadge = await UserBadge.findOne({
            userID: userID,
            badgeID: badge._id
        });

        if (!existingBadge) {
            const meetsRequirements = await checkBadgeRequirements(userID, badge);
            
            if (meetsRequirements) {
                const userBadge = new UserBadge({
                    userID: userID,
                    badgeID: badge._id,
                    currentLevel: 1,
                    currentValue: await getUserValueForBadgeType(userID, badge.requirements.type)
                });
                
                await userBadge.save();
                
                return {
                    badge: badge,
                    userBadge: userBadge,
                    isNew: true
                };
            }
        }

        return null;
    } catch (error) {
        console.error('[BADGES] Error checking single badge:', error);
        return null;
    }
}

/**
 * Pobiera wartość użytkownika dla danego typu odznaki
 */
async function getUserValueForBadgeType(userID, type) {
    try {
        const profile = await global.UserProfile.findOne({ userID });
        if (!profile) return 0;

        switch (type) {
            case 'bumps':
                const userServers = await global.serversdata.find({ 'owners.id': userID });
                return userServers.reduce((total, server) => total + (server.bump?.count || 0), 0);
                
            case 'reviews':
                const userBots = await global.botsdata.find({ 'owners.id': userID });
                const userServersList = await global.serversdata.find({ 'owners.id': userID });
                const botComments = userBots.reduce((total, bot) => total + (bot.comments?.length || 0), 0);
                const serverComments = userServersList.reduce((total, server) => total + (server.comments?.length || 0), 0);
                return botComments + serverComments;
                
            case 'joinDate':
                const joinDate = profile.createdAt || new Date();
                return Math.floor((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
                
            case 'referrals':
                return profile.referralCount || 0;
                
            case 'servers':
                return await global.serversdata.countDocuments({ 'owners.id': userID });
                
            default:
                return 0;
        }
    } catch (error) {
        console.error('[BADGES] Error getting user value:', error);
        return 0;
    }
}

/**
 * Sprawdza czy użytkownik spełnia wymagania dla danej odznaki (stary system)
 */
async function checkBadgeRequirements(userID, badge) {
    try {
        if (badge.requirements.type === 'manual') {
            return false;
        }

        const userValue = await getUserValueForBadgeType(userID, badge.requirements.type);
        const requirement = badge.requirements;

        // Dla odznak poziomowych sprawdź najniższy poziom
        if (badge.isLevelBased && badge.levels.length > 0) {
            const lowestLevel = badge.levels.sort((a, b) => a.level - b.level)[0];
            return userValue >= lowestLevel.requiredValue;
        }

        // Stary system sprawdzania
        if (!requirement.value) return false;

        switch (requirement.operator) {
            case '>=': return userValue >= requirement.value;
            case '>': return userValue > requirement.value;
            case '=': return userValue === requirement.value;
            case '<': return userValue < requirement.value;
            case '<=': return userValue <= requirement.value;
            default: return false;
        }
    } catch (error) {
        console.error('[BADGES] Error checking requirements:', error);
        return false;
    }
}

/**
 * Pobiera odznaki użytkownika z aktualnymi poziomami
 */
async function getUserBadges(userID) {
    try {
        const userBadges = await UserBadge.find({ 
            userID: userID, 
            isVisible: true 
        }).populate('badgeID').sort({ lastUpdated: -1 });

        return userBadges.map(ub => {
            const badge = ub.badgeID;
            let currentLevelData = null;
            
            if (badge.isLevelBased && badge.levels.length > 0) {
                currentLevelData = badge.levels.find(level => level.level === ub.currentLevel);
            }

            return {
                badge: badge,
                userBadge: ub,
                currentLevel: ub.currentLevel,
                currentValue: ub.currentValue,
                levelData: currentLevelData,
                earnedAt: ub.earnedAt,
                lastUpdated: ub.lastUpdated,
                isVisible: ub.isVisible
            };
        });
    } catch (error) {
        console.error('[BADGES] Error getting user badges:', error);
        return [];
    }
}

/**
 * Pobiera następny poziom odznaki dla użytkownika
 */
async function getNextBadgeLevel(userID, badgeID) {
    try {
        const userBadge = await UserBadge.findOne({ userID, badgeID }).populate('badgeID');
        if (!userBadge || !userBadge.badgeID.isLevelBased) return null;

        const badge = userBadge.badgeID;
        const nextLevel = badge.levels.find(level => level.level > userBadge.currentLevel);
        
        if (!nextLevel) return null;

        const currentValue = await getUserValueForBadgeType(userID, badge.requirements.type);
        const progress = Math.min((currentValue / nextLevel.requiredValue) * 100, 100);

        return {
            level: nextLevel,
            currentValue: currentValue,
            requiredValue: nextLevel.requiredValue,
            progress: progress
        };
    } catch (error) {
        console.error('[BADGES] Error getting next level:', error);
        return null;
    }
}

module.exports = {
    checkAndAwardBadges,
    checkBadgeRequirements,
    getUserBadges,
    getNextBadgeLevel,
    getUserValueForBadgeType
};
