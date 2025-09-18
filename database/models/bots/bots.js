const mongoose = require("mongoose");

let hm = new mongoose.Schema({
    botID: String,
    appID: String,
    ownerID: String,
    coowners: Array,
    username: String,
    avatar: String,

    prefix: String,

    inviteURL: String,
    githubURL: String,
    donateURL: String,
    websiteURL: String,
    supportURL: String,
    webhookURL: String,

    shortDesc: String,
    longDesc: String,
	
	framework: {
        type: String,
        default: "", 
        enum: [ 
            "Discord.js",
            "Discord.py",
            "Eris",
            "JDA",
            "Discord4J",
            "Disnake",
            "Nextcord",
            "Pycord",
            "Other"
        ]
    },

    customBannerURL: {
        type: String,
        default: ""
    },
	
    vanityURL: {
        type: String,
        default: "",
        unique: true,
        sparse: true
    },
	
	rank: {
        type: String,
        default: ""
    },

    tags: Array,
    status: {
        type: String,
        default: "unverified"
    },

    promote: {
        type: Boolean,
        default: false
    },

    rates: [
        {
            author: String,
            star_rate: String,
            message: String,
            id: String,
            date: {
                type: Date,
                default: Date.now
            },
            replies: [
                {
                    _id: {
                        type: mongoose.Schema.Types.ObjectId,
                        default: () => new mongoose.Types.ObjectId()
                    },
                    author: String,
                    authorName: String,
                    authorAvatar: String,
                    message: String,
                    date: {
                        type: Date,
                        default: Date.now
                    }
                }
            ]
        }
    ],
    Date: {
        type: Date,
        default: Date.now
    },
    votes: {
        type: Number,
        default: 0
    },

    token: String,

    faq: {
        type: [
            {
                question: String,
                answer: String,
            }
        ],
        default: [], // Domyślnie pusta tablica
    },

    // Nowe pole dla komend bota
    commands: {
        type: [
            {
                name: String,
                description: String,
            }
        ],
        default: [],
    },
	
    analytics: {
        views: {
            type: Number,
            default: 0
        }
    }
});


module.exports = mongoose.model('bots', hm);
