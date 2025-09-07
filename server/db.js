// server/db.js
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'qr_order.db');

// Kết nối hoặc tạo file database nếu chưa tồn tại
const db = new Database(dbPath, { verbose: console.log });

console.log('Đã kết nối tới database SQLite.');

module.exports = db;