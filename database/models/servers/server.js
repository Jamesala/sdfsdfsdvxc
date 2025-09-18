const mongoose = require("mongoose");

let hm = new mongoose.Schema({
    serverID: { type: String, required: true, unique: true },
    inviteURL: String,
    vanityURL: String,
    patroniteURL: String,
    stronaURL: String,
    customBannerURL: String,
    ownerID: { type: String, required: true },
    ownerAvatar: { type: String, default: 'https://cdn.discordapp.com/embed/avatars/0.png' }, // Nowe pole
    longDesc: String,
    shortDesc: { type: String, default: '' },
    tags: Array,
	status: { 
        type: String, 
        enum: ['BASIC', 'PRO', 'GOLD', null],
        default: null 
    },
    promotedUntil: {
        type: Date,
        default: null
    },
    administration: [
        {
            userID: String,
            role: String,
            color: String,
            addedBy: String,
            addedAt: {
                type: Date,
                default: Date.now
            },
            avatar: {
                type: String,
                default: 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            nickname: { 
                type: String,
                default: ''
            }
        }
    ],
    theme: {
        type: String,
        default: 'default'
    },
    votes: {
        type: Number,
        default: 0
    },
    Date: {
        type: Date,
        default: Date.now
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
    analytics: {
        views: {
            type: Number,
            default: 0
        }
    },
    
    events: [
        {
            id: {
                type: String,
                required: true
            },
            name: {
                type: String,
                required: true,
                maxlength: 100
            },
            description: {
                type: String,
                maxlength: 1000
            },
            startDate: {
                type: Date,
                required: true
            },
            endDate: {
                type: Date,
                required: true
            },
            imageURL: String,
            createdAt: {
                type: Date,
                default: Date.now
            },
            createdBy: {
                type: String,
                required: true
            }
        }
    ]
});

module.exports = mongoose.model("servers", hm);