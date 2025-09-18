const botVotes = require('../../../../database/models/bots/vote');
const botsdata = require('../../../../database/models/bots/bots');
const RoleConfig = require('../../../../database/models/roleConfig');
const BumpConfig = require('../../../../database/models/bumpConfig');
const VoteAbuseDetector = require('../../../../utils/voteAbuseDetector');

module.exports = {
    name: 'bump-bot',
    category: 'General',
    description: 'Zagłosuj na bota.',
    options: [
        {
            name: 'bot',
            description: 'Wybierz bota, na którego chcesz zagłosować',
            type: 6, // USER type
            required: true
        }
    ],
    run: async (interaction, serverClient) => {
        try {
            const { guild, user, options } = interaction;
            const botUser = options.getUser('bot');

            if (!guild) {
                return interaction.reply({
                    content: '❌ Ta komenda może być używana tylko na serwerze, nie w prywatnych wiadomościach.',
                    ephemeral: true
                });
            }

            // Sprawdzenie czy użytkownik ma awatar
            const discordUser = await global.client.users.fetch(user.id);
            if (!discordUser.avatar) {
                return interaction.reply({
                    ephemeral: true,
                    content: '❌ Aby głosować, musisz mieć ustawione zdjęcie profilowe na koncie Discord.'
                });
            }

            // Sprawdzenie wieku konta (min. 30 dni)
            const accountAge = Date.now() - discordUser.createdTimestamp;
            if (accountAge < 2592000000) {
                return interaction.reply({
                    ephemeral: true,
                    content: '❌ Twoje konto jest zbyt młode. Musisz mieć konto przez co najmniej 30 dni, aby móc głosować.'
                });
            }

            // Sprawdzenie czy to bot
            if (!botUser.bot) {
                return interaction.reply({
                    content: '❌ Możesz głosować tylko na boty!',
                    ephemeral: true
                });
            }

            let botdata = await botsdata.findOne({ botID: botUser.id });
            if (!botdata) {
                return interaction.reply({
                    embeds: [{
                        title: `❌ Błąd`,
                        description: "Ten bot nie jest zarejestrowany w naszej bazie danych. Dodaj go na stronie.",
                        color: 0xff0000
                    }],
                    components: [{
                        type: 1,
                        components: [
                            {
                                type: 2,
                                style: 5,
                                label: "Dodaj bota",
                                url: `${global.config.website.url}/bots/new`,
                                emoji: { id: "1368685106960793733" }
                            },
                            {
                                type: 2,
                                style: 5,
                                label: "Pomoc",
                                url: `${global.config.website.support}`,
                                emoji: { id: "1368685037389746196" }
                            }
                        ]
                    }]
                });
            }

            if (botdata.status != "Approved") {
                return interaction.reply({
                    content: '❌ Aktualny bot nie został jeszcze zatwierdzony.',
                    ephemeral: true
                });
            }

            let voted = await botVotes.findOne({ userID: user.id, botID: botUser.id });
            if (voted) {
                let timeLeft = 10800000 - (Date.now() - voted.Date);
                if (timeLeft > 0) {
                    let hours = Math.floor(timeLeft / 3600000);
                    let minutes = Math.floor((timeLeft % 3600000) / 60000);
                    let seconds = Math.floor(((timeLeft % 3600000) % 60000) / 1000);
                    let totalTime = `${hours ? `${hours} godz, ` : ""}${minutes ? `${minutes} min, ` : ""}${seconds ? `${seconds} sek` : ""}`;

                    return interaction.reply({
                        ephemeral: true,
                        embeds: [{
                            description: `<:vote:1368685083363643482> Już zagłosowałeś na tego bota! Zaczekaj **${totalTime}**, aby ponownie zagłosować.`,
                            color: 0xff0000,
                            footer: {
                                text: ` Głosowanie na ${botUser.username}`,
                                icon_url: botUser.displayAvatarURL()
                            }							
                        }]
                    });
                }
            }

            // Sprawdź czy głosowanie jest podejrzane
            const abuseCheck = await VoteAbuseDetector.checkForAbuse(botUser.id, user.id, interaction.clientIP);

            if (abuseCheck.isSuspicious) {
                const susChannel = interaction.guild.channels.cache.get('1388550329863504023'); // Zamień na ID kanału
                if (susChannel) {
                    susChannel.send({
                        content: `🚨 **Podejrzane głosowanie (przez komendę)** 🚨
\n**Bot:** <@${botUser.id}> (${botUser.id})
\n**Użytkownik:** <@${user.id}> (${user.id})
\n**Powody:**\n- ${abuseCheck.reasons.join('\n- ')}
\n**Czas:** <t:${Math.floor(Date.now()/1000)}:R>`
                    });
                }
            }

            const updatedVote = await botVotes.findOneAndUpdate(
                { userID: user.id, botID: botUser.id },
                { 
                    $set: { 
                        Date: Date.now(),
                        ip: interaction.clientIP || 'unknown' 
                    }, 
                    $inc: { bumpCount: 1 } 
                },
                { upsert: true, new: true } // Dodano new: true aby zwrócić zaktualizowany dokument
            );
            const updatedBotData = await botsdata.findOneAndUpdate(
                { botID: botUser.id },
                { $inc: { votes: 1 } },
                { upsert: true, new: true } // Dodano new: true aby zwrócić zaktualizowany dokument
            );

            // Sprawdzenie i nadanie ról za bumpowanie
            const roleConfig = await RoleConfig.findOne({ serverID: guild.id });
            if (roleConfig) {
                const bumpCount = updatedVote?.bumpCount || 0;

                const member = guild.members.cache.get(user.id);
                if (member) {
                    for (const { count, roleId } of roleConfig.botBumpThresholds || []) {
                        if (bumpCount === count) {
                            const role = guild.roles.cache.get(roleId);

                            if (role) {
                                if (!guild.members.me.permissions.has('MANAGE_ROLES')) {
                                    console.warn(`Brak uprawnień do nadawania ról na serwerze: ${guild.name}`);
                                    continue;
                                }

                                try {
                                    await member.roles.add(role);
                                    interaction.followUp({
                                        embeds: [{
                                            title: `🎉 Osiągnięto próg głosów!`,
                                            description: `Gratulacje! Otrzymałeś rolę **${role.name}** za **${bumpCount}** głosów na bota!`,
                                            color: 0x5865f2
                                        }]
                                    });
                                } catch (error) {
                                    console.error(`Błąd podczas dodawania roli: ${error.message}`);
                                }
                            }
                        }
                    }
                }
            }

            // Sprawdzenie konfiguracji przypomnień i ustawienie przypomnienia dla bot bump
            const bumpConfig = await BumpConfig.findOne({ serverID: guild.id });
            if (bumpConfig && bumpConfig.enabled && bumpConfig.reminderChannelId) {
                // Ustaw przypomnienie na 3 godziny (10800000 ms)
                setTimeout(async () => {
                    try {
                        const reminderChannel = guild.channels.cache.get(bumpConfig.reminderChannelId);
                        if (reminderChannel) {
                            await reminderChannel.send({
                                embeds: [{
                                    title: '🤖 Przypomnienie o bump bota!',
                                    description: `<@${user.id}> Możesz ponownie zagłosować!`,
                                    color: 0x5865f2,
									image: { url: 'https://discordzik.pl/assets/img/anim/bump-again.webp' },
                                    footer: {
                                        text: 'Użyj komendy /bump-bot aby zagłosować',
                                        icon_url: guild.iconURL()
                                    },
                                    timestamp: new Date()
                                }]
                            });
                        }
                    } catch (error) {
                        console.error('Error sending bot bump reminder:', error);
                    }
                }, 10800000); // 3 godziny
            }

            return interaction.reply({
                embeds: [{
                    author: {
                        name: `Głosujący: ${user.tag}`,
                        icon_url: user.displayAvatarURL()
                    },
                    description: `Dziękujemy za wsparcie bota **${botUser.username}**.`,
                    fields: [
                        { name: "Łączna Liczba Głosów", value: `**${updatedBotData.votes}**`, inline: true }
                    ],
                    color: 0x5865f2,
                    image: { url: 'https://discordzik.pl/assets/img/anim/bump-bot.webp' },
                    footer: {
                        text: "Zachęcamy do dalszego głosowania!",
                        icon_url: 'https://discordzik.pl/assets/img/logo.png'
                    },
                    timestamp: new Date()
                }],
                components: [{
                    type: 1,
                    components: [
                        {
                            type: 2,
                            style: 5,
                            label: "Strona Bota",
                            url: `${global.config.website.url}/bot/${botUser.id}`,
                            emoji: { id: "1368685071300694036" }
                        },
                        {
                            type: 2,
                            style: 5,
                            label: "Dodaj Serwer",
                            url: `${global.config.website.url}/servers/new`,
                            emoji: { id: "1368685106960793733" }
                        }
                    ]
                }]
            });

        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ Wystąpił błąd podczas przetwarzania komendy.' });
        }
    }
};