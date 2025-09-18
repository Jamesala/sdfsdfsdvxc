module.exports = {
    name: 'ready',
    run: async (serverClient) => {
        try {
            console.success(`[Discord Server List] Logged in as ${serverClient.user.tag}`.brightYellow);

            const updatePresence = async () => {
                try {
                    // Pobierz rzeczywistą liczbę serwerów z Discord API zamiast z bazy danych
                    const serverCount = serverClient.guilds.cache.size;
                    serverClient.user.setPresence({
                        activities: [
                            { name: `/bump | Grasuje w ${serverCount} serwerach!` }
                        ],
                        status: 'online' // Ensure the status is explicitly set
                    });
                } catch (err) {
                    console.error('Error updating presence:', err);
                }
            };

            // Update immediately on login
            await updatePresence();

            // Update every 10 minutes
            setInterval(updatePresence, 60000 * 10); // 10 minutes
        } catch (e) {
            console.error('Error during ready event:', e);
        }
    }
}
