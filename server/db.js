// server/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'qr_order.db');

// Kết nối hoặc tạo file database nếu chưa tồn tại
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Lỗi kết nối database:', err.message);
    } else {
        console.log('Đã kết nối tới database SQLite.');
    }
});

module.exports = db;