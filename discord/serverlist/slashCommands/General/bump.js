const serverVotes = require("../../../../database/models/serverVotes");
const serversdata = require("../../../../database/models/servers/server");
const RoleConfig = require("../../../../database/models/roleConfig");
const BumpConfig = require("../../../../database/models/bumpConfig");
const VoteAbuseDetector = require("../../../../utils/voteAbuseDetector");

module.exports = {
    name: "bump",
    category: "General",
    description: "Zagłosuj na serwer.",
    options: [],
    run: async (interaction, serverClient) => {
        // Najpierw od razu odpowiadamy, aby Discord nie myślał, że komenda nie odpowiada
        await interaction.deferReply({ ephemeral: false });

        try {
            const { guild, user } = interaction;

            if (!guild) {
                return interaction.editReply({
                    content:
                        "❌ Ta komenda może być używana tylko na serwerze, nie w prywatnych wiadomościach.",
                });
            }

            // Sprawdzenie czy użytkownik ma awatar
            const discordUser = await global.client.users.fetch(user.id);
            if (!discordUser.avatar) {
                return interaction.editReply({
                    content:
                        "❌ Aby głosować, musisz mieć ustawione zdjęcie profilowe na koncie Discord.",
                });
            }

            // Sprawdzenie wieku konta (min. 30 dni)
            const accountAge = Date.now() - discordUser.createdTimestamp;
            if (accountAge < 2592000000) {
                return interaction.editReply({
                    content:
                        "❌ Twoje konto jest zbyt młode. Musisz mieć konto przez co najmniej 30 dni, aby móc głosować.",
                });
            }

            let serverdata = await serversdata.findOne({ serverID: guild.id });
            if (!serverdata) {
                return interaction.editReply({
                    embeds: [
                        {
                            title: `❌ Błąd`,
                            description:
                                "Ten serwer nie jest zarejestrowany w naszej bazie danych. Dodaj go na stronie.",
                            color: 0xff0000,
                        },
                    ],
                    components: [
                        {
                            type: 1,
                            components: [
                                {
                                    type: 2,
                                    style: 5,
                                    label: "Dodaj serwer",
                                    url: `${global.config.website.url}/servers/new`,
                                    emoji: { id: "1368685106960793733" },
                                },
                                {
                                    type: 2,
                                    style: 5,
                                    label: "Bot",
                                    url: `https://discord.com/api/oauth2/authorize?client_id=${global.serverClient.user.id}&permissions=1&scope=bot%20applications.commands`,
                                    emoji: { id: "1368685129257713664" },
                                },
                                {
                                    type: 2,
                                    style: 5,
                                    label: "Pomoc",
                                    url: `${global.config.website.support}`,
                                    emoji: { id: "1368685037389746196" },
                                },
                            ],
                        },
                    ],
                });
            }

            let voted = await serverVotes.findOne({
                userID: user.id,
                serverID: guild.id,
            });
            if (voted) {
                let timeLeft = 10800000 - (Date.now() - voted.Date);
                if (timeLeft > 0) {
                    let hours = Math.floor(timeLeft / 3600000);
                    let minutes = Math.floor((timeLeft % 3600000) / 60000);
                    let seconds = Math.floor(
                        ((timeLeft % 3600000) % 60000) / 1000,
                    );
                    let totalTime = `${hours ? `${hours} godz, ` : ""}${minutes ? `${minutes} min, ` : ""}${seconds ? `${seconds} sek` : ""}`;

                    return interaction.editReply({
                        embeds: [
                            {
                                description: `<:vote:1368685083363643482> Już zagłosowałeś! Zaczekaj **${totalTime}**, aby ponownie zagłosować.`,
                                color: 0xff0000,
                                footer: {
                                    text: ` Głosowanie na ${guild.name}`,
                                    icon_url: guild.iconURL(),
                                },
                            },
                        ],
                    });
                }
            }

            // Aktualizacja głosów użytkownika
            const updatedVote = await serverVotes.findOneAndUpdate(
                { userID: user.id, serverID: guild.id },
                { $inc: { bumpCount: 1 }, $set: { Date: Date.now() } },
                { upsert: true, new: true },
            );

            // Aktualizacja statystyk serwera
            await serversdata.findOneAndUpdate(
                { serverID: guild.id },
                { $inc: { votes: 1 } },
                { upsert: true },
            );

            // Sprawdzenie i nadanie ról za bumpowanie
            const roleConfig = await RoleConfig.findOne({ serverID: guild.id });
            if (roleConfig) {
                const bumpCount = updatedVote.bumpCount;
                const member = guild.members.cache.get(user.id);

                if (member) {
                    for (const { count, roleId } of roleConfig.bumpThresholds) {
                        if (bumpCount === count) {
                            const role = guild.roles.cache.get(roleId);

                            if (role) {
                                if (
                                    !guild.members.me.permissions.has(
                                        "MANAGE_ROLES",
                                    )
                                ) {
                                    console.warn(
                                        `Brak uprawnień do nadawania ról na serwerze: ${guild.name}`,
                                    );
                                    continue;
                                }

                                try {
                                    await member.roles.add(role);
                                    // Używamy followUp zamiast editReply, ponieważ już odpowiedzieliśmy
                                    await interaction.followUp({
                                        content: `🎉 Gratulacje! Otrzymałeś rolę **${role.name}** za ${bumpCount} głosów!`,
                                        ephemeral: true,
                                    });
                                } catch (error) {
                                    console.error(
                                        `Błąd podczas dodawania roli: ${error.message}`,
                                    );
                                }
                            }
                        }
                    }
                }
            }

            // Sprawdzenie konfiguracji przypomnień i zapisanie w bazie danych
            const bumpConfig = await BumpConfig.findOne({ serverID: guild.id });
            if (
                bumpConfig &&
                bumpConfig.enabled &&
                bumpConfig.reminderChannelId
            ) {
                const BumpReminder = require("../../../../database/models/bumpReminder");
                
                // Usuń stare przypomnienie użytkownika dla tego serwera (jeśli istnieje)
                await BumpReminder.deleteMany({ 
                    serverID: guild.id, 
                    userID: user.id, 
                    reminderType: 'server',
                    isExecuted: false 
                });

                // Utwórz nowe przypomnienie na 3 godziny
                const scheduledTime = new Date(Date.now() + 10800000); // 3 godziny
                await BumpReminder.create({
                    serverID: guild.id,
                    userID: user.id,
                    reminderType: 'server',
                    scheduledTime: scheduledTime,
                    channelID: bumpConfig.reminderChannelId,
                    isExecuted: false
                });

                console.log(`[REMINDER] Ustawiono przypomnienie serwera dla ${user.id} na ${scheduledTime}`);
            }

            // Finalna odpowiedź
            return interaction.editReply({
                embeds: [
                    {
                        author: {
                            name: `Głosujący: ${user.tag}`,
                            icon_url: user.displayAvatarURL(),
                        },
                        description: `Dziękujemy za wsparcie serwera **${guild.name}**.`,
                        fields: [
                            {
                                name: "Łączna Liczba Głosów",
                                value: `**${serverdata.votes + 1}**`,
                                inline: true,
                            },
                        ],
                        color: 0x5865f2,
                        image: {
                            url: "https://discordzik.pl/assets/img/anim/bump.webp",
                        },
                        footer: {
                            text: "Zachęcamy do dalszego głosowania!",
                            icon_url:
                                "https://discordzik.pl/assets/img/logo.png",
                        },
                        timestamp: new Date(),
                    },
                ],
                components: [
                    {
                        type: 1,
                        components: [
                            {
                                type: 2,
                                style: 5,
                                label: "Strona Serwera",
                                url: `${global.config.website.url}/server/${guild.id}`,
                                emoji: { id: "1368685071300694036" },
                            },
                            {
                                type: 2,
                                style: 5,
                                label: "Dodaj Serwer",
                                url: `${global.config.website.url}/servers/new`,
                                emoji: { id: "1368685106960793733" },
                            },
                        ],
                    },
                ],
            });
        } catch (err) {
            console.error(err);
            return interaction.editReply({
                content: "❌ Wystąpił błąd podczas przetwarzania komendy.",
            });
        }
    },
};
