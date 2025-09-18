const ObjectId = require('mongoose').Types.ObjectId;

module.exports = {
    name: "botinfo",
    category: "Information",
    cooldown: 2,
    usage: "botinfo <bot>",
    description: "Get bot's information",
    run: async (client, message, args) => {
        if (!args[0]) return message.channel.send(`${message.author} Please specify a bot`);

        let arg = args[0].replace(/['"]+/g, '')
        let valid = ObjectId.isValid(arg);
        let b = await botsdata.findOne({
            [valid ? '_id' : 'botID']: (valid ? arg : (message.mentions.users.size ? message.mentions.users.first().id : arg))
        });

        if (!b) return message.channel.send(`${message.author} Wygląda na to, że tego bota nie ma w bazie danych.`);

        let botOwner = await client.users.fetch(b.ownerID)
        let fetchedBot = await client.users.fetch(b.botID)
        let coowners = b.coowners.map(async (id) => {
            try {
                let user = await client.users.fetch(id)
                if (user) return user
            } catch (e) { null }
        })

        try {
            let startTime = Date.now();
            let msg = await message.channel.send("Czekaj...");

            const embed = {};
            embed.color = 0x5865F2;
            embed.author = {
                name: fetchedBot.username,
                icon_url: fetchedBot.displayAvatarURL() ? fetchedBot.displayAvatarURL() : "https://cdn.discordapp.com/embed/avatars/0.png"
            };
            embed.description = b.shortDesc;
            embed.fields = [];
            embed.fields.push(
                { name: "ID", value: fetchedBot.id, inline: true },
                { name: "Nazwa", value: fetchedBot.username, inline: true },
                { name: "Discriminator", value: fetchedBot.discriminator, inline: true },
                { name: "Status", value: client.guilds.cache.get(config.server.id).members.cache.get(fetchedBot.id)?.presence?.status || "Not Cached", inline: true },
                { name: "Prefix", value: b.prefix?.toString() || 'Unknown', inline: true },
                { name: "Głosów", value: b.votes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","), inline: true },
                { name: "Serwerów", value: b.serverCount?.toString() || "N/A", inline: true },
                { name: "Strona", value: b.website?.toString() || "N/A", inline: true },
                { name: "Powstał:", value: "<t:" + ~~(fetchedBot.createdTimestamp / 1000) + ">", inline: true },
                { name: "Właściciel", value: `${botOwner.tag} (${botOwner.id})` ?? "Unknown#0000" },
                { name: "Współwłaściciel", value: `${(await Promise.all(coowners)).filter((x) => x).map((x) => `- ${x.tag} (${x.id})`).join("\n") || "None"}` },
                { name: "Web-Page", value: `${config.website.url}/bot/${b.botID}` });
            embed.footer = {
                text: `Na prośbę ${message.author.username} | ${Date.now() - startTime} ms`
            };
            embed.timestamp = new Date();

            msg.edit({
                content: b._id.toString(),
                embeds: [embed]
            });
        } catch (e) {
            message.channel.send(`Coś poszło nie tak.\n\`\`\`js\n${e}\`\`\``)
            console.log(e)
        }

    }
};