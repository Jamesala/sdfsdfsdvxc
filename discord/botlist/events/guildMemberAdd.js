module.exports = {
    name: 'guildMemberAdd',
    run: async (client, member) => {
        try {
            if (member.guild.id !== global.config.server.id) return;
            const welcomeChannel = global.config.server.channels.welcome;

            let embed = {};
            embed.color = 0x2F3136;
            embed.description = `
Witamy w klubie ${member}!`;
            embed.image = {
                url: "https://discordzik.pl/assets/img/banner.png"
            };

            global.client.channels.cache.get(welcomeChannel).send({
                content: embed.description,
                // Removed the files array
            });



        } catch (e) {
            console.log(e);
        }
    }
};