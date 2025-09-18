const BumpReminder = require("../database/models/bumpReminder");

class ReminderSystem {
    constructor(client) {
        this.client = client;
        this.interval = null;
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;

        console.log("[REMINDER SYSTEM] Uruchamianie systemu przypomnień...");
        this.isRunning = true;

        // Sprawdzaj przypomnienia co minutę
        this.interval = setInterval(async () => {
            await this.processReminders();
        }, 60000); // 60 sekund

        // Wykonaj pierwsze sprawdzenie od razu
        this.processReminders();
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        console.log("[REMINDER SYSTEM] System przypomnień zatrzymany");
    }

    async processReminders() {
        try {
            const now = new Date();

            // Znajdź wszystkie przypomnienia, które są gotowe do wykonania
            const dueReminders = await BumpReminder.find({
                scheduledTime: { $lte: now },
                isExecuted: false
            });

            if (dueReminders.length === 0) {
                return; // Brak przypomnień do wykonania
            }

            console.log(`[REMINDER SYSTEM] Przetwarzanie ${dueReminders.length} przypomnień o ${now.toISOString()}`);

            console.log(`[REMINDER SYSTEM] Przetwarzanie ${dueReminders.length} przypomnień`);

            for (const reminder of dueReminders) {
                try {
                    await this.executeReminder(reminder);

                    // Oznacz jako wykonane
                    reminder.isExecuted = true;
                    await reminder.save();

                } catch (error) {
                    console.error(`[REMINDER SYSTEM] Błąd podczas wykonywania przypomnienia ${reminder._id}:`, error);

                    // Oznacz jako wykonane nawet jeśli wystąpił błąd, aby uniknąć powtarzania
                    reminder.isExecuted = true;
                    await reminder.save();
                }
            }

            // Usuń stare wykonane przypomnienia (starsze niż 24 godziny)
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            await BumpReminder.deleteMany({
                isExecuted: true,
                createdAt: { $lt: oneDayAgo }
            });

        } catch (error) {
            console.error("[REMINDER SYSTEM] Błąd podczas przetwarzania przypomnień:", error);
        }
    }

    async executeReminder(reminder) {
        console.log(`[REMINDER SYSTEM] Próba wykonania przypomnienia: ServerID=${reminder.serverID}, ChannelID=${reminder.channelID}, UserID=${reminder.userID}, Type=${reminder.reminderType}`);

        const guild = this.client.guilds.cache.get(reminder.serverID);
        if (!guild) {
            console.log(`[REMINDER SYSTEM] Serwer ${reminder.serverID} nie znaleziony w cache. Dostępne serwery: ${this.client.guilds.cache.map(g => g.id).join(', ')}`);
            return;
        }

        const channel = guild.channels.cache.get(reminder.channelID);
        if (!channel) {
            console.log(`[REMINDER SYSTEM] Kanał ${reminder.channelID} nie znaleziony na serwerze ${reminder.serverID}. Dostępne kanały: ${guild.channels.cache.map(c => c.id).join(', ')}`);
            return;
        }

        // Sprawdź uprawnienia bota do wysyłania wiadomości
        try {
            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions || !permissions.has(['SendMessages', 'EmbedLinks'])) {
                console.log(`[REMINDER SYSTEM] Bot nie ma uprawnień do wysyłania wiadomości w kanale ${reminder.channelID}`);
                return;
            }
        } catch (permissionError) {
            console.error(`[REMINDER SYSTEM] Błąd sprawdzania uprawnień dla kanału ${reminder.channelID}:`, permissionError);
            return;
        }

        const embedData = reminder.reminderType === 'server' ? {
            title: "Przypomnienie o bump!",
            description: `Możesz ponownie zagłosować na serwer`,
            footer: { text: "Użyj komendy /bump aby zagłosować" }
        } : {
            title: "Przypomnienie o bump bota!",
            description: `Możesz ponownie zagłosować na bota ${reminder.botID ? `<@${reminder.botID}>` : ''}.`,
            footer: { text: "Użyj komendy /bump-bot aby zagłosować" }
        };

        try {
            const messageContent = reminder.reminderType === 'server'
                ? `<@${reminder.userID}>`
                : `<@${reminder.userID}>`;

            await Promise.race([
                channel.send({
                    content: messageContent,
                    embeds: [{
                        ...embedData,
                        color: 0x5865f2,
                        image: {
                            url: "https://discordzik.pl/assets/img/anim/bump-again.webp",
                        },
                        footer: {
                            ...embedData.footer,
                            icon_url: guild.iconURL(),
                        },
                        timestamp: new Date(),
                    }]
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), 10000))
            ]);

            console.log(`[REMINDER SYSTEM] Wysłano przypomnienie do ${reminder.userID} na serwer ${reminder.serverID}`);
        } catch (sendError) {
            console.error(`[REMINDER SYSTEM] Błąd wysyłania przypomnienia w kanale ${reminder.channelID}:`, sendError.message);
            throw sendError; // Re-throw aby oznaczyć jako wykonane
        }
    }
}

module.exports = ReminderSystem;