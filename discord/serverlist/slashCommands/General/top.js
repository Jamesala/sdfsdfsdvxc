const serverVotes = require('../../../../database/models/serverVotes');

module.exports = {
    name: 'top',
    category: 'General',
    description: 'Pokazuje top głosujących na serwerze',
    run: async (interaction, serverClient) => {
        try {
            const { guild } = interaction;

            if (!guild) {
                return interaction.reply({
                    content: '❌ Ta komenda może być używana tylko na serwerze.',
                    ephemeral: true
                });
            }

            // Pobierz wszystkich użytkowników którzy głosowali na tym serwerze
            const allVotes = await serverVotes.find({ serverID: guild.id });

            // Grupuj głosy według użytkownika i sumuj
            const userVotesMap = new Map();

            allVotes.forEach(record => {
                const currentCount = userVotesMap.get(record.userID) || 0;
                userVotesMap.set(record.userID, currentCount + (record.bumpCount || 1));
            });

            // Konwertuj mapę na tablicę i sortuj malejąco
            const sortedUsers = Array.from(userVotesMap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10); // Top 10

            // Pobierz informacje o użytkownikach
            const topUsers = [];
            for (const [userId, votes] of sortedUsers) {
                try {
                    const user = await guild.client.users.fetch(userId);
                    topUsers.push({
                        name: user.username,
                        votes: votes
                    });
                } catch (error) {
                    // Jeśli użytkownik nie jest już na serwerze, pomiń
                    console.log(`User ${userId} not found, skipping...`);
                }
            }

            // Przygotuj embed
            const embed = {
                color: 0x5865f2,
                title: `🏆 Top ${topUsers.length} głosujących na serwerze`,
                description: topUsers.map((user, index) => 
                    `**${index + 1}.** ${user.name} - **${user.votes}** głosów`
                ).join('\n'),
                footer: {
                    text: `Ranking głosujących • ${guild.name}`,
                    icon_url: guild.iconURL()
                },
                timestamp: new Date()
            };

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

        } catch (err) {
            console.error(err);
            return interaction.reply({ 
                content: '❌ Wystąpił błąd podczas generowania rankingu.',
                ephemeral: true 
            });
        }
    }
};