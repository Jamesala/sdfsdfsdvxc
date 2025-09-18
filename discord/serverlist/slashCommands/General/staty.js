const serverVotes = require('../../../../database/models/serverVotes');
const RoleConfig = require('../../../../database/models/roleConfig');

module.exports = {
    name: 'staty',
    category: 'General',
    description: 'Sprawdź swoje statystyki głosowania',
    options: [
        {
            name: 'użytkownik',
            description: 'Użytkownik, którego statystyki chcesz sprawdzić',
            type: 6, // USER type
            required: false
        }
    ],
    run: async (interaction, serverClient) => {
        try {
            const { guild, user, options } = interaction;
            const targetUser = options.getUser('użytkownik') || user;

            if (!guild) {
                return interaction.reply({
                    content: '❌ Ta komenda może być używana tylko na serwerze.',
                    ephemeral: true
                });
            }

            // Pobierz głosy z kolekcji serverVotes
            const votesFromServerVotes = await serverVotes.find({ 
                userID: targetUser.id, 
                serverID: guild.id 
            });

            // Oblicz całkowitą liczbę głosów na tym serwerze
            const totalVotesOnServer = votesFromServerVotes.reduce((sum, record) => {
                return sum + (record.bumpCount || 1);
            }, 0);

            // Głosy na wszystkich serwerach
            const allVotesFromServerVotes = await serverVotes.find({ userID: targetUser.id });
            const totalVotesAllServers = allVotesFromServerVotes
                .reduce((sum, record) => sum + (record.bumpCount || 1), 0);

            // Pobierz konfigurację ról
            const roleConfig = await RoleConfig.findOne({ serverID: guild.id });
            let progressField = null;
            
            if (roleConfig && roleConfig.bumpThresholds.length > 0) {
                const sortedThresholds = [...roleConfig.bumpThresholds].sort((a, b) => a.count - b.count);
                const nextThreshold = sortedThresholds.find(threshold => threshold.count > totalVotesOnServer);
                const currentThreshold = [...sortedThresholds].reverse().find(threshold => threshold.count <= totalVotesOnServer);
                
                if (nextThreshold) {
                    const progress = Math.min(Math.floor((totalVotesOnServer / nextThreshold.count) * 100), 100);
                    const progressBar = createProgressBar(progress);
                    
                    progressField = {
                        name: `Postęp do następnej roli (${nextThreshold.count} głosów)`,
                        value: `${progressBar} ${progress}%\nŁącznie na serwerze: ${totalVotesOnServer}/${nextThreshold.count}`,
                        inline: false
                    };
                } else if (currentThreshold) {
                    progressField = {
                        name: 'Osiągnięto maksymalny poziom!',
                        value: `Posiadasz już rolę za ${currentThreshold.count} głosów! 🎉\nŁącznie na serwerze: ${totalVotesOnServer}`,
                        inline: false
                    };
                }
            }

            const embed = {
                color: 0x5865f2,
                author: {
                    name: `Statystyki głosowania ${targetUser.username}`,
                    icon_url: targetUser.displayAvatarURL()
                },
                fields: [
                    {
                        name: 'Głosy na tym serwerze',
                        value: `**${totalVotesOnServer}** głosów`,
                        inline: true
                    },
                    {
                        name: 'Głosy na wszystkich serwerach',
                        value: `**${totalVotesAllServers}** głosów`,
                        inline: true
                    }
                ],
                footer: {
                    text: `Statystyki głosowania • ${guild.name}`,
                    icon_url: guild.iconURL()
                },
                timestamp: new Date()
            };

            if (progressField) {
                embed.fields.push(progressField);
            }

            return interaction.reply({
                embeds: [embed],
                components: [{
                    type: 1,
                    components: [
                        {
                            type: 2,
                            style: 5,
                            label: "Strona Serwera",
                            url: `${global.config.website.url}/server/${guild.id}`,
                            emoji: { id: "1368685071300694036" }
                        }
                    ]
                }],
                ephemeral: true
            });

        } catch (err) {
            console.error(err);
            return interaction.reply({ 
                content: '❌ Wystąpił błąd podczas sprawdzania statystyk.',
                ephemeral: true 
            });
        }
    }
};

function createProgressBar(percentage) {
    const progressBlocks = 10;
    const filledBlocks = Math.round((percentage / 100) * progressBlocks);
    const emptyBlocks = progressBlocks - filledBlocks;

    const greenBlock = '🟦';
    const emptyBlock = '⬜';

    return greenBlock.repeat(filledBlocks) + emptyBlock.repeat(emptyBlocks);
}
