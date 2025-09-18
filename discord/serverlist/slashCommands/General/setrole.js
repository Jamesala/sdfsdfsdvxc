const RoleConfig = require('../../../../database/models/roleConfig');

module.exports = {
    name: 'setrole',
    category: 'General',
    description: 'Skonfiguruj role dla określonych progów głosów. UWAGA: Daj botu permisje przydzielania rangi',
    options: [
        {
            name: 'threshold',
            description: 'Liczba głosów wymagana do przypisania roli.',
            type: 4, // Integer option
            required: true
        },
        {
            name: 'role',
            description: 'Rola do przypisania w celu osiągnięcia progu.',
            type: 8, // Role option
            required: true
        }
    ],
    run: async (interaction, serverClient) => {
        try {
            const { guild, user, member } = interaction;
            
            if (!guild) {
                return interaction.reply({
                    content: '❌ Ta komenda może być używana tylko na serwerze, nie w prywatnych wiadomościach.',
                    ephemeral: true
                });
            }

            // Sprawdź czy użytkownik jest właścicielem lub ma uprawnienia administratora
            const isOwner = guild.ownerId === user.id;
            const isAdmin = member.permissions.has('ADMINISTRATOR');
            
            if (!isOwner && !isAdmin) {
                return interaction.reply({
                    content: '❌ Tylko właściciel serwera lub administratorzy mogą skonfigurować role głosów.',
                    ephemeral: true
                });
            }

            // Get the provided threshold and role
            const threshold = interaction.options.getInteger('threshold');
            const role = interaction.options.getRole('role');

            // Validate inputs
            if (threshold <= 0) {
                return interaction.reply({
                    content: '❌ Próg musi być liczbą dodatnią.',
                    ephemeral: true
                });
            }

            // Find or create RoleConfig for the server
            let roleConfig = await RoleConfig.findOne({ serverID: guild.id });
            if (!roleConfig) {
                roleConfig = new RoleConfig({
                    serverID: guild.id,
                    bumpThresholds: []
                });
            }

            // Check and remove previous role if necessary
            const previousRoleIndex = roleConfig.bumpThresholds.findIndex(config => config.roleId === role.id);
            if (previousRoleIndex >= 0) {
                // Remove the previous role from the list
                roleConfig.bumpThresholds.splice(previousRoleIndex, 1);
            }

            // Update or add the threshold-role pair
            const existingIndex = roleConfig.bumpThresholds.findIndex(config => config.count === threshold);
            if (existingIndex >= 0) {
                roleConfig.bumpThresholds[existingIndex].roleId = role.id;
            } else {
                roleConfig.bumpThresholds.push({ count: threshold, roleId: role.id });
            }

            await roleConfig.save();

            // Now assign the new role to the user (if they meet the threshold)
            const currentRoles = member.roles.cache.map(r => r.id);
            
            // Remove previous role(s) and assign the new one
            for (const config of roleConfig.bumpThresholds) {
                if (currentRoles.includes(config.roleId) && config.roleId !== role.id) {
                    await member.roles.remove(config.roleId); // Remove previous role
                }
            }

            await member.roles.add(role.id); // Add the new role

            // Confirm success
            return interaction.reply({
                content: `✅ Rola **${role.name}** została przydzielona po osiągnięciu **${threshold} głosów**.`,
                ephemeral: true
            });
        } catch (err) {
            console.error('Error in setrole command:', err);

            // Respond with a generic error message
            return interaction.reply({
                content: '❌ Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.',
                ephemeral: true
            });
        }
    }
};