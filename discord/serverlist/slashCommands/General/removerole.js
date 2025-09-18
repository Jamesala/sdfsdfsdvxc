const RoleConfig = require('../../../../database/models/roleConfig');

module.exports = {
    name: 'removerole',
    category: 'General',
    description: 'Usuń konfigurację roli dla określonego progu głosów',
    options: [
        {
            name: 'threshold',
            description: 'Próg głosów do usunięcia',
            type: 4, // Integer option
            required: true
        }
    ],
    run: async (interaction) => {
        try {
            const { guild, user, member } = interaction;
            
            if (!guild) {
                return interaction.reply({
                    content: '❌ Ta komenda może być używana tylko na serwerze, nie w prywatnych wiadomościach.',
                    ephemeral: true
                });
            }

            // Sprawdź uprawnienia
            const isOwner = guild.ownerId === user.id;
            const isAdmin = member.permissions.has('ADMINISTRATOR');
            
            if (!isOwner && !isAdmin) {
                return interaction.reply({
                    content: '❌ Tylko właściciel serwera lub administratorzy mogą usuwać konfigurację ról.',
                    ephemeral: true
                });
            }

            const threshold = interaction.options.getInteger('threshold');

            // Znajdź konfigurację serwera
            const roleConfig = await RoleConfig.findOne({ serverID: guild.id });
            if (!roleConfig || roleConfig.bumpThresholds.length === 0) {
                return interaction.reply({
                    content: '❌ Nie znaleziono żadnych skonfigurowanych ról dla tego serwera.',
                    ephemeral: true
                });
            }

            // Znajdź i usuń próg
            const thresholdIndex = roleConfig.bumpThresholds.findIndex(config => config.count === threshold);
            if (thresholdIndex === -1) {
                return interaction.reply({
                    content: `❌ Nie znaleziono roli przypisanej do progu ${threshold} głosów.`,
                    ephemeral: true
                });
            }

            // Usuń próg
            roleConfig.bumpThresholds.splice(thresholdIndex, 1);
            await roleConfig.save();

            return interaction.reply({
                content: `✅ Usunięto rolę przypisaną do progu ${threshold} głosów.`,
                ephemeral: true
            });
        } catch (err) {
            console.error('Error in removerole command:', err);
            return interaction.reply({
                content: '❌ Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.',
                ephemeral: true
            });
        }
    }
};