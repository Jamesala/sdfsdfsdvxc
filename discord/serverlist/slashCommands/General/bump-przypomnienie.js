
const BumpConfig = require('../../../../database/models/bumpConfig');

module.exports = {
    name: 'bump-przypomnienie',
    category: 'General',
    description: 'Włącz lub wyłącz przypomnienia o bump (tylko dla właścicieli serwera)',
    options: [
        {
            name: 'enable',
            description: 'Czy włączyć przypomnienia (true/false)',
            type: 5, // BOOLEAN type
            required: true
        },
        {
            name: 'kanal',
            description: 'Kanał do wysyłania przypomnień (opcjonalne)',
            type: 7, // CHANNEL type
            required: false
        }
    ],
    run: async (interaction, serverClient) => {
        try {
            const { guild, user, options } = interaction;
            const enable = options.getBoolean('enable');
            const selectedChannel = options.getChannel('kanal');

            if (!guild) {
                return interaction.reply({
                    content: '❌ Ta komenda może być używana tylko na serwerze.',
                    ephemeral: true
                });
            }

            // Sprawdzenie czy użytkownik jest właścicielem serwera
            if (guild.ownerId !== user.id) {
                return interaction.reply({
                    content: '❌ Tylko właściciel serwera może zarządzać przypomnieniami o bump.',
                    ephemeral: true
                });
            }

            // Sprawdzenie czy wybrany kanał jest kanałem tekstowym
            if (selectedChannel && selectedChannel.type !== 0) {
                return interaction.reply({
                    content: '❌ Wybrany kanał musi być kanałem tekstowym.',
                    ephemeral: true
                });
            }

            // Znajdź lub utwórz konfigurację bump dla serwera
            let bumpConfig = await BumpConfig.findOne({ serverID: guild.id });
            if (!bumpConfig) {
                bumpConfig = new BumpConfig({
                    serverID: guild.id,
                    enabled: false,
                    reminderChannelId: null
                });
            }

            bumpConfig.enabled = enable;
            if (enable) {
                // Użyj wybranego kanału lub aktualny kanał jako domyślny
                bumpConfig.reminderChannelId = selectedChannel ? selectedChannel.id : interaction.channelId;
            } else {
                bumpConfig.reminderChannelId = null;
            }

            await bumpConfig.save();

            const statusText = enable ? 'włączone' : 'wyłączone';
            const channelId = enable ? (selectedChannel ? selectedChannel.id : interaction.channelId) : null;
            const channelText = enable ? ` w kanale <#${channelId}>` : '';

            return interaction.reply({
                embeds: [{
                    title: '✅ Konfiguracja przypomnień o bump',
                    description: `Przypomnienia o bump zostały **${statusText}**${channelText}.`,
                    color: enable ? 0x00ff00 : 0xff0000,
                    footer: {
                        text: enable ? 'Przypomnienia będą wysyłane 3 godziny po każdym bump' : 'Przypomnienia są wyłączone'
                    }
                }],
                ephemeral: true
            });

        } catch (err) {
            console.error('Error in bump-przypomnienie command:', err);
            return interaction.reply({
                content: '❌ Wystąpił błąd podczas konfiguracji przypomnień.',
                ephemeral: true
            });
        }
    }
};
