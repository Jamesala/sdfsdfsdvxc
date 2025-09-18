module.exports = {
    name: "bump",
    category: "General",
    cooldown: 4,
    usage: "bump",
    description: "Zagłosuj na serwer",
    isCommand: true,
    run: async (serverClient, message, args) => {
        try {
            const votes = require("../../../../database/models/servers/vote.js");

            let serverdata = await serversdata.findOne({
                serverID: message.guild.id
            });

            const embed = {};
            if (!serverdata) {
                embed.title = `[Oops] Głosowanie ${message.guild.name}`;
                embed.description = "Ten serwer nie jest zarejestrowany w naszej bazie danych. Proszę uruchomić polecenie `register`, aby zarejestrować swój serwer";
                embed.color = 0xff0000; // Red
                return message.channel.send({
                    embeds: [embed],
                    components: [{
                        type: 1,
                        components: [
                            {
                                type: 2,
                                style: 5,
                                label: "Dodaj serwer",
                                url: `${global.config.website.url}/servers/new`,
                                disabled: global.config.website.url ? false : true,
                                emoji: {
                                    name: "🔗"
                                }
                            }, {
                                type: 2,
                                style: 5,
                                label: "Bot",
                                url: `https://discord.com/api/oauth2/authorize?client_id=${global.serverClient.user.id}&permissions=1&scope=bot%20applications.commands`,
                                emoji: {
                                    name: "🤖"
                                }
                            }, {
                                type: 2,
                                style: 5,
                                label: "Pomoc",
                                url: `${global.config.website.support}`,
                                emoji: {
                                    name: "✋"
                                }
                            }]
                    }]
                });
            }

            let voted = await votes.findOne({ userID: message.author.id, serverID: message.guild.id });
            if (voted) {
                let timeLeft = 10800000 - (Date.now() - voted.Date);
                if (timeLeft > 0) {
                    let hours = Math.floor(timeLeft / 3600000);
                    let minutes = Math.floor((timeLeft % 3600000) / 60000);
                    let seconds = Math.floor(((timeLeft % 3600000) % 60000) / 1000);
                    let totalTime = `${hours > 0 ? `${hours} godzin, ` : ""}${minutes > 0 ? `${minutes} minut, ` : ""}${seconds > 0 ? `${seconds} sekund` : ""}`;
                    return message.channel.send({
                        embeds: [{
                            title: "Głosowanie na " + message.guild.name,
                            author: {
                                name: `${message.author.tag} (${message.author.id})`,
                                icon_url: message.author.displayAvatarURL()
                            },
                            description: `Już zagłosowałeś na ten serwer. Proszę zaczekaj ${totalTime} zanim zrobisz to ponownie.`,
                            color: 0xffb914 // Red
                        }],
                        components: [{
                            type: 1,
                            components: [
                                {
                                    type: 2,
                                    style: 5,
                                    label: "Zobacz Serwer",
                                    url: `${global.config.website.url}/server/${message.guild.id}`,
                                    emoji: {
                                        name: "🔗"
                                    }
                                }, {
                                    type: 2,
                                    style: 5,
                                    label: "Dodaj serwer",
                                    url: `${global.config.website.url}/servers/new`,
                                    emoji: {
                                        name: "➕"
                                    }
                                }
                            ]
                        }]
                    });
                }
            }

            await votes.findOneAndUpdate({ userID: message.author.id, serverID: message.guild.id }, {
                $set: {
                    Date: Date.now(),
                }
            }, {
                upsert: true
            });

            await serversdata.findOneAndUpdate({ serverID: message.guild.id }, {
                $inc: {
                    votes: 1
                }
            }, {
                upsert: true
            });

            setTimeout(async () => {
                await votes.findOneAndDelete({ userID: message.author.id, serverID: message.guild.id });
            }, 10800000); // 3 hours

            return message.channel.send({
                embeds: [{
                    title: "Zagłosowałeś!",
                    author: {
                        name: `${message.author.tag} (${message.author.id})`,
                        icon_url: message.author.displayAvatarURL() || 'https://cdn.discordapp.com/embed/avatars/0.png'
                    },
                    description: `Udało Ci się zagłosować na ten serwer. Dziękujemy za wsparcie!`,
                    fields: [{
                        name: "Serwer",
                        value: `${message.guild.name} (${message.guild.id})`,
                    }, {
                        name: "Głos od",
                        value: `${message.author.tag} (${message.author.id})`,
                    }, {
                        name: "Głosów Łącznie",
                        value: `${serverdata.votes + 1}`,
                    }, {
                        name: `Nast. głos dla ${message.author.tag}`,
                        value: `Za 3 godz`,
                    }],
                    color: 0x00ff00 // Green
                }],
                components: [{
                    type: 1,
                    components: [
                        {
                            type: 2,
                            style: 5,
                            label: "Zobacz Serwer",
                            url: `${global.config.website.url}/server/${message.guild.id}`,
                            emoji: {
                                name: "🔗"
                            }
                        }, {
                            type: 2,
                            style: 5,
                            label: "Bot",
                            url: `https://discord.com/api/oauth2/authorize?client_id=${global.serverClient.user.id}&permissions=1&scope=bot%20applications.commands`,
                            emoji: {
                                name: "🤖"
                            }
                        }, {
                            type: 2,
                            style: 5,
                            label: "Dodaj Serwer",
                            url: `${global.config.website.url}/servers`,
                            disabled: global.config.website.url ? false : true,
                            emoji: {
                                name: "🔗"
                            }
                        }
                    ]
                }]
            });
        } catch (e) {
            console.log(String(e.stack).bgRed)
        }
    }
};