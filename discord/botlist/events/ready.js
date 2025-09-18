require('cute-logs');
module.exports = {
    name: 'ready',
    run: async (client) => {
        try {
            console.success(`[Discord Bot List] Logged in as ${client.user.tag}`.brightYellow);

            setInterval(async () => {
                let bots = await botsdata.find() || [];
                client.user.setPresence({
                    activities: [
                        { name: `${bots.length ? bots.length : 0} botów! | /bump aby zagłosować` }
                    ],
                });
            }, 60000 * 10); // 10 minutes
        } catch (e) {
            console.log(e);
        }
    }
}