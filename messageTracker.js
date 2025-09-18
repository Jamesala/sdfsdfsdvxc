const fs = require('fs');
const path = require('path');

// Struktura danych w pamięci
let messageData = {
    servers: {}, // { serverID: { channels: { channelID: { users: { userID: count } } } } }
    lastUpdate: Date.now()
};

// Ścieżka do pliku zapisu
const DATA_FILE = path.join(__dirname, 'messageStats.json');

// ===== ZAPISYWANIE DANYCH DO PLIKU =====
function saveToFile() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(messageData, null, 2));
    console.log('[Tracker] Dane zapisane do pliku.');
}

// ===== WCZYTYWANIE DANYCH Z PLIKU =====
function loadFromFile() {
    if (fs.existsSync(DATA_FILE)) {
        const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
        messageData = JSON.parse(rawData);
        console.log('[Tracker] Dane wczytane z pliku.');
    }
}

// ===== AKTUALIZACJA STATYSTYK =====
function trackMessage(serverID, channelID, userID) {
    if (!messageData.servers[serverID]) {
        messageData.servers[serverID] = { channels: {} };
    }
    if (!messageData.servers[serverID].channels[channelID]) {
        messageData.servers[serverID].channels[channelID] = { users: {} };
    }
    if (!messageData.servers[serverID].channels[channelID].users[userID]) {
        messageData.servers[serverID].channels[channelID].users[userID] = 0;
    }

    messageData.servers[serverID].channels[channelID].users[userID]++;
    messageData.lastUpdate = Date.now();
}

// ===== POBRANIE STATYSTYK SERWERA (ostatnie X godzin) =====
function getServerStats(serverID, hours = 24) {
    if (!messageData.servers[serverID]) return { totalMessages: 0, activeUsers: 0 };

    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    let totalMessages = 0;
    let activeUsers = 0;

    for (const channelID in messageData.servers[serverID].channels) {
        for (const userID in messageData.servers[serverID].channels[channelID].users) {
            totalMessages += messageData.servers[serverID].channels[channelID].users[userID];
            activeUsers++;
        }
    }

    return { totalMessages, activeUsers };
}

// Automatyczne zapisywanie co godzinę
setInterval(saveToFile, 60 * 60 * 1000);

// Wczytaj dane przy starcie
loadFromFile();

module.exports = { trackMessage, getServerStats, saveToFile };