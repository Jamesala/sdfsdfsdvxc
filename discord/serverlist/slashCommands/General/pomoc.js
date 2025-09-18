const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'pomoc',
    category: 'General',
    description: 'Wyświetla pomocne informacje o bocie i jego funkcjach.',
    options: [],
    run: async (interaction) => {
        try {
            const embed = {
                title: "Pomoc - Lista Komend",
                description: "Discordzik.pl – najlepsze źródło polskich serwerów i botów Discord!",
                color: 0x5865F2,
                thumbnail: {
                    url: 'https://discordzik.pl/assets/img/dzikicon.png'
                },
                fields: [
                    {
                        name: "📊 Głosowanie",
                        value: "`/bump` - Zagłosuj na serwer\n`/setrole` - Ustaw progi rang\n`/removerole` - Usuń progi rang\n`/top` - Top 10 głosujących\n`/staty` - Statystyki głosowania\n`/bump-przypomnienie` - Ustaw przypomnienia o bumpach",
                        inline: false
                    },
                    {
                        name: "ℹ️ Informacje",
                        value: "`/pomoc` - Wyświetla tę wiadomość",
                        inline: false
                    }
                ],
				image: { url: 'https://discordzik.pl/assets/img/anim/pomoc.webp' },
                footer: {
                    text: "Discordzik.pl • Wersja 5.2.7",
                    icon_url: 'https://discordzik.pl/assets/img/dzikicon.png'
                },
                timestamp: new Date(),
            };

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Strona')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://discordzik.pl/')
                        .setEmoji('🌐'),
                    new ButtonBuilder()
                        .setLabel('Serwer Wsparcia')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://discordzik.pl/discord')
                        .setEmoji('🛠️'),
                    new ButtonBuilder()
                        .setLabel('Dodaj Serwer')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://discordzik.pl/')
                        .setEmoji('➕')
                );

            await interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });
        } catch (err) {
            console.error('Błąd w komendzie pomoc:', err);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: '⚠️ Wystąpił błąd podczas wyświetlania pomocy.',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: '⚠️ Wystąpił błąd podczas wyświetlania pomocy.',
                    ephemeral: true
                });
            }
        }
    }
};