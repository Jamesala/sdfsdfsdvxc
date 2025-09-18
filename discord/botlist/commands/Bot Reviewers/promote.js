const roles = global.config.server.roles;

module.exports = {
  name: "promote",
  category: "Bot Reviewers",
  cooldown: 2,
  usage: "promote <bot>",
  description: "Promote a bot",
  run: async (client, message, args) => {
    let guild = client.guilds.cache.get(config.server.id);
    if (guild.members.cache.has(message.author.id)) {
      if (guild.members.cache.get(message.author.id).roles.cache.has(roles.botReviewer)) {
        var bot = message.mentions.users.first();

        if (bot) {
          var botUser = bot;
        } else {
          var botID = args[0];
          var botUser = client.users.cache.get(botID);
        }

        if (!botUser) {
          return message.channel.send(":x: | Podałeś nieprawidłowy identyfikator lub wzmiankę o bota.");
        }

        const botData = await botsdata.findOne({
          botID: botUser.id
        });

        if (!botData) {
          return message.channel.send(":x: | Podałeś nieprawidłowy identyfikator lub wzmiankę o bota");
        }

        if (botData.promote) {
          return message.channel.send("Ten bot jest już promowany.");
        }

        await botsdata.findOneAndUpdate({
          botID: botUser.id
        }, {
          $set: {
            promote: true
          },
        });

        message.channel.send("Bot jest promowany :D");
      }
    }
  },
};
