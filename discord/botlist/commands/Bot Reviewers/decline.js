const roles = global.config.server.roles;

module.exports = {
    name: "decline",
    category: "Bot Reviewers",

    cooldown: 2,
    usage: "decline <bot> <reason?",
    description: "Decline a bot",
    run: async (client, message, args) => {
        let guild = client.guilds.cache.get(config.server.id);
        if (guild.members.cache.has(message.author.id)) {
            if (guild.members.cache.get(message.author.id).roles.cache.has(roles.botReviewer)) {
                var bot = message.mentions.users.first();
                if (bot) {
                    var bot = bot;
                } else {
                    var bot = args[0];
                    var bot = client.users.cache.get(bot);
                }
                if (!bot) {
                    return message.channel.send(
                        "Podałeś nieprawidłowy identyfikator lub wzmiankę o bota"
                    );
                }

                let botdata = await botsdata.findOne({
                    botID: bot.id
                });
                if (!botdata) {
                    return message.channel.send("Nieprawidłowy bot");
                }
                if (botdata.status === "Approved") {
                    return message.channel.send("Ten bot został już przez kogoś zatwierdzony");
                }

                var reason = args.join(" ").replace(args[0], "");
                if (!reason) {
                    return message.channel.send("Powód nie został podany");
                }

                client.users.fetch(bot.id).then(bota => {
                    client.channels.cache.get(config.server.channels.botlogs).send(`${global.config.server.emojis.decline ?? "❌"} <@${botdata.ownerID}>${botdata.coowners?.length ? `, ${botdata.coowners.map(u => `<@${u}>`).join(', ')}` : ''} bot o nazwie <@${bota.id}> został odrzucony przez <@${message.author.id}>.\n**Powód:** ${reason}`);
                });
                await botsdata.findOneAndDelete({
                    botID: bot.id
                });
                message.channel.send("Bot został odrzucony :C");
            }
        }
    }
};