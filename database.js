const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const path = require('path');

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

const isTurso = !!tursoUrl;
let db = null;
let tursoClient = null;

if (isTurso) {
  tursoClient = createClient({
    url: tursoUrl,
    authToken: tursoToken,
  });
} else {
  // Dynamically require sqlite3 only when running locally without Turso.
  // This avoids Vercel build/runtime issues with native SQLite binary modules.
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.resolve(__dirname, 'miva_maintenance.db');
  db = new sqlite3.Database(dbPath);
}

// Helper to run query as Promise
async function dbRun(sql, params = []) {
  if (isTurso) {
    const res = await tursoClient.execute({ sql, args: params });
    return {
      lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined,
      changes: Number(res.rowsAffected)
    };
  } else {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }
}

// Helper to get single row as Promise
async function dbGet(sql, params = []) {
  if (isTurso) {
    const res = await tursoClient.execute({ sql, args: params });
    if (res.rows.length === 0) return undefined;
    return { ...res.rows[0] };
  } else {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

// Helper to get all rows as Promise
async function dbAll(sql, params = []) {
  if (isTurso) {
    const res = await tursoClient.execute({ sql, args: params });
    return res.rows.map(row => ({ ...row }));
  } else {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

// Initialize Database Schemas and Seed Data
async function initDb() {
  // Enable foreign keys
  await dbRun("PRAGMA foreign_keys = ON");

  // 1. Roles table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    )
  `);

  // 2. Users table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      FOREIGN KEY (role_id) REFERENCES roles (id)
    )
  `);

  // 3. Categories table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    )
  `);

  // 4. Service Requests table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS service_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'In Progress', 'Completed')),
      submitter_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories (id),
      FOREIGN KEY (submitter_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // 5. Assignments table (assigned officers to requests)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL UNIQUE,
      officer_id INTEGER NOT NULL,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES service_requests (id) ON DELETE CASCADE,
      FOREIGN KEY (officer_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // 6. Status Logs / Audit Trail table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS status_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      updated_by_id INTEGER NOT NULL,
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES service_requests (id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by_id) REFERENCES users (id)
    )
  `);

  // --- SEED DATA ---
  // Seed Roles
  await dbRun("INSERT OR IGNORE INTO roles (id, name) VALUES (1, 'Administrator')");
  await dbRun("INSERT OR IGNORE INTO roles (id, name) VALUES (2, 'Maintenance Officer')");
  await dbRun("INSERT OR IGNORE INTO roles (id, name) VALUES (3, 'Student/Staff')");

  // Seed Categories
  const categories = [
    [1, 'Faulty Electricity'],
    [2, 'Damaged Furniture'],
    [3, 'Leaking Pipes'],
    [4, 'Internet Problems'],
    [5, 'Classroom Equipment Issues'],
    [6, 'Hostel Maintenance']
  ];
  for (const cat of categories) {
    await dbRun("INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)", cat);
  }

  // Seed Default Users
  const salt = await bcrypt.genSalt(10);
  
  // Seed Admin
  const adminHash = await bcrypt.hash('admin123', salt);
  await dbRun(`
    INSERT OR IGNORE INTO users (name, email, password_hash, role_id)
    VALUES ('MIVA Admin', 'admin@miva.edu.ng', ?, 1)
  `, [adminHash]);

  // Seed Maintenance Officer
  const officerHash = await bcrypt.hash('officer123', salt);
  await dbRun(`
    INSERT OR IGNORE INTO users (name, email, password_hash, role_id)
    VALUES ('John Maintenance', 'officer@miva.edu.ng', ?, 2)
  `, [officerHash]);

  // Seed Student
  const studentHash = await bcrypt.hash('student123', salt);
  await dbRun(`
    INSERT OR IGNORE INTO users (name, email, password_hash, role_id)
    VALUES ('Maurice Student', 'student@miva.edu.ng', ?, 3)
  `, [studentHash]);

  console.log("Database initialized and seeded successfully.");
}

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDb
};
