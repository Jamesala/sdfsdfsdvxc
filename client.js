const { Client, GatewayIntentBits } = require('discord.js');

const config = require('./config.js');
global.config = config;

const client = (global.client = new Client({
    fetchAllMembers: true,
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ]
}));

const fs = require('fs');
client.commands = new Map();
client.aliases = new Map();
client.categories = fs.readdirSync('./discord/botlist/commands/');
client.cooldowns = new Map();
client.slashCommands = new Map();

client.md = require('markdown-it')({
    html: true, 
    linkify: true, 
    typographer: true, 
    xhtmlOut: true, 
    breaks: true, 
    langPrefix: 'language-',
    quotes: '“”‘’', 
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(lang, str, true).value;
            } catch (__) { }
        }
        return ''; 
    }
});

['eventHandler', 'commandHandler', 'slashHandler'].map(handler => {
    require(`./discord/botlist/handlers/${handler}`)(client);
});

const connectToDatabase = async () => {
    await require('./database/connect.js')(client);
};

const clientReady = new Promise(resolve => {
    client.on("ready", async () => {
        await require('./index.js')(client);
        await connectToDatabase();
        resolve();
    });
});

client.login(global.config.client.token).catch(() => { console.error('Invalid token.'); });

const serverClient = (global.serverClient = new Client({
    fetchAllMembers: true,
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
}));

serverClient.commands = new Map();
serverClient.aliases = new Map();
serverClient.categories = fs.readdirSync('./discord/serverlist/commands/');
serverClient.cooldowns = new Map();
serverClient.slashCommands = new Map();

['eventHandler', 'commandHandler', 'slashHandler'].forEach(handler => {
    require(`./discord/serverlist/handlers/${handler}`)(serverClient);
});

serverClient.login(global.config.serverClient.token).catch(() => { console.error('Invalid token.'); });
