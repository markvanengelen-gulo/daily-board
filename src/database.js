const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/daily-board.db');

// Initialize database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initializeDatabase();
  }
});

// Initialize database schema
function initializeDatabase() {
  db.serialize(() => {
    // Create fixed_daily_tasks table
    db.run(`
      CREATE TABLE IF NOT EXISTS fixed_daily_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        task_name TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        removed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, task_name)
      )
    `);

    // Create dynamic_tasks table
    db.run(`
      CREATE TABLE IF NOT EXISTS dynamic_tasks (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        text TEXT NOT NULL,
        is_focus INTEGER DEFAULT 0,
        display_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create list_tabs table
    db.run(`
      CREATE TABLE IF NOT EXISTS list_tabs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create list_content table
    db.run(`
      CREATE TABLE IF NOT EXISTS list_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tab_name TEXT NOT NULL UNIQUE,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized.');
  });
}

module.exports = db;
