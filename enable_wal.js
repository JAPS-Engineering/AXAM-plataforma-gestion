const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'dev.db');

try {
    console.log(`Opening database at ${dbPath}...`);
    const db = new Database(dbPath);

    console.log('Current journal_mode:', db.pragma('journal_mode', { simple: true }));

    console.log('Setting journal_mode = WAL...');
    const result = db.pragma('journal_mode = WAL', { simple: true });

    console.log('New journal_mode:', result);

    db.close();
    console.log('Done.');
} catch (error) {
    console.error('Error:', error.message);
}
