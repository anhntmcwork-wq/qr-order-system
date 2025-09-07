const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');
const db = require('./db');

// Khởi tạo database khi server start
require('./init-db.js');

const app = express();
app.use(cors());
app.use(express.json());

// --- PHỤC VỤ FILE FRONTEND ---
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST", "PATCH"] }
});

// --- API ENDPOINTS ---

// [GET] Lấy toàn bộ thực đơn
app.get('/api/menu', (req, res) => {
    try {
        const sql = `
            SELECT p.id, p.name, p.price, c.name as category, p.image_url, p.options
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE p.is_available = TRUE
        `;
        const rows = db.prepare(sql).all();
        const products = rows.map(p => ({
            ...p,
            options: p.options ? JSON.parse(p.options) : {}
        }));
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [GET] Lấy các đơn hàng đang hoạt động
app.get('/api/orders', (req, res) => {
    try {
        const ordersSql = `
            SELECT o.id, o.status, o.total_amount, o.note, o.created_at, t.name AS table_name
            FROM orders o
            JOIN tables t ON o.table_id = t.id
            WHERE o.status IN ('new', 'preparing', 'served')
            ORDER BY o.created_at ASC;
        `;
        const orders = db.prepare(ordersSql).all();

        if (orders.length === 0) return res.json([]);

        const orderIds = orders.map(o => o.id);
        const itemsSql = `
            SELECT oi.order_id, oi.quantity, oi.selected_options, p.name
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id IN (${orderIds.join(',')})
        `;
        const items = db.prepare(itemsSql).all();

        const ordersWithItems = orders.map(order => ({
            ...order,
            items: items
                .filter(item => item.order_id === order.id)
                .map(item => ({
                    name: item.name,
                    qty: item.quantity,
                    options: item.selected_options ? JSON.parse(item.selected_options) : {}
                }))
        }));

        res.json(ordersWithItems);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [POST] Tạo đơn hàng mới
app.post('/api/orders', (req, res) => {
    try {
        const { tableNumber, items, totalAmount, note } = req.body;
        if (!tableNumber || !items || items.length === 0) {
            return res.status(400).json({ error: 'Thiếu thông tin bàn hoặc món ăn.' });
        }

        const orderSql = 'INSERT INTO orders (table_id, total_amount, note) VALUES (?, ?, ?)';
        const info = db.prepare(orderSql).run(tableNumber, totalAmount, note);
        const orderId = info.lastInsertRowid;

        const stmt = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, selected_options) VALUES (?, ?, ?, ?)');
        items.forEach(item => {
            const optionsString = JSON.stringify(item.options || {});
            stmt.run(orderId, item.id, item.quantity, optionsString);
        });

        const getNewOrderSql = `
            SELECT o.id, o.status, o.total_amount, o.note, o.created_at, t.name AS table_name
            FROM orders o JOIN tables t ON o.table_id = t.id WHERE o.id = ?
        `;
        const newOrder = db.prepare(getNewOrderSql).get(orderId);

        const detailedItems = items.map(item => ({
            name: item.name,
            qty: item.quantity,
            options: item.options
        }));

        const createdOrderPayload = { ...newOrder, items: detailedItems };

        io.emit('new_order', createdOrderPayload);
        res.status(201).json(createdOrderPayload);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [PATCH] Cập nhật trạng thái đơn hàng
app.patch('/api/orders/:id/status', (req, res) => {
    try {
        const { status } = req.body;
        const orderId = req.params.id;
        const allowedStatus = ['preparing', 'served', 'paid'];

        if (!status || !allowedStatus.includes(status)) {
            return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
        }

        const sql = 'UPDATE orders SET status = ? WHERE id = ?';
        db.prepare(sql).run(status, orderId);
        io.emit('order_status_updated', { orderId: parseInt(orderId, 10), status });

        // io.emit('order_status_updated', { orderId, status });
        res.json({ message: 'Cập nhật trạng thái thành công.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
