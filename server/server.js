const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');
const db = require('./db');

// Gọi file init-db.js để khởi tạo database ngay khi server khởi động
require('./init-db.js');

const app = express();
app.use(cors());
app.use(express.json());


// --- PHỤC VỤ FILE FRONTEND ---
// Sửa lại đường dẫn cho đúng
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST", "PATCH"] }
});

// --- API ENDPOINTS ---

// [GET] Lấy toàn bộ thực đơn (Không đổi)
app.get('/api/menu', (req, res) => {
    const sql = `
        SELECT p.id, p.name, p.price, c.name as category, p.image_url, p.options
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.is_available = TRUE
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        // Chuyển đổi options từ string về lại object
        const products = rows.map(p => ({
            ...p,
            options: p.options ? JSON.parse(p.options) : {}
        }));
        res.json(products);
    });
});

// [GET] Lấy các đơn hàng đang hoạt động (SỬA LẠI CHO SQLITE)
app.get('/api/orders', (req, res) => {
    const ordersSql = `
        SELECT o.id, o.status, o.total_amount, o.note, o.created_at, t.name AS table_name
        FROM orders o
        JOIN tables t ON o.table_id = t.id
        WHERE o.status IN ('new', 'preparing', 'served')
        ORDER BY o.created_at ASC;
    `;
    db.all(ordersSql, [], (err, orders) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (orders.length === 0) {
            return res.json([]);
        }

        const orderIds = orders.map(o => o.id);
        const itemsSql = `
            SELECT oi.order_id, oi.quantity, oi.selected_options, p.name
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id IN (${orderIds.join(',')})
        `;

        db.all(itemsSql, [], (err, items) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
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
        });
    });
});

// [POST] Tạo đơn hàng mới (Sửa để lấy thông tin chi tiết hơn)
app.post('/api/orders', (req, res) => {
    const { tableNumber, items, totalAmount, note } = req.body;
    if (!tableNumber || !items || items.length === 0) {
        return res.status(400).json({ error: 'Thiếu thông tin bàn hoặc món ăn.' });
    }

    const orderSql = 'INSERT INTO orders (table_id, total_amount, note) VALUES (?, ?, ?)';
    db.run(orderSql, [tableNumber, totalAmount, note], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const orderId = this.lastID;
        const itemsSql = 'INSERT INTO order_items (order_id, product_id, quantity, selected_options) VALUES (?, ?, ?, ?)';
        
        const stmt = db.prepare(itemsSql);
        items.forEach(item => {
            const optionsString = JSON.stringify(item.options || {});
            stmt.run(orderId, item.id, item.quantity, optionsString);
        });
        stmt.finalize();

        // Lấy lại đầy đủ thông tin đơn hàng vừa tạo để gửi qua socket
        const getNewOrderSql = `
            SELECT o.id, o.status, o.total_amount, o.note, o.created_at, t.name AS table_name
            FROM orders o JOIN tables t ON o.table_id = t.id WHERE o.id = ?`;

        db.get(getNewOrderSql, [orderId], (err, newOrder) => {
            if (err) {
                console.error("Lỗi khi lấy lại đơn hàng mới:", err);
                return res.status(201).json({ id: orderId, message: "Tạo đơn hàng thành công nhưng không thể lấy lại chi tiết." });
            }
            
            const detailedItems = items.map(item => ({
                name: item.name,
                qty: item.quantity,
                options: item.options
            }));

            const createdOrderPayload = { ...newOrder, items: detailedItems };

            io.emit('new_order', createdOrderPayload); // Gửi sự kiện cho trang nhân viên
            res.status(201).json(createdOrderPayload);
        });
    });
});


// [PATCH] Cập nhật trạng thái đơn hàng (VIẾT MỚI)
app.patch('/api/orders/:id/status', (req, res) => {
    const { status } = req.body;
    const orderId = req.params.id;
    const allowedStatus = ['preparing', 'served', 'paid'];

    if (!status || !allowedStatus.includes(status)) {
        return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
    }

    const sql = 'UPDATE orders SET status = ? WHERE id = ?';
    db.run(sql, [status, orderId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Không tìm thấy đơn hàng.' });
        }

        const updatedOrder = { id: orderId, new_status: status };
        io.emit('order_update', updatedOrder); // Gửi sự kiện cập nhật
        res.json(updatedOrder);
    });
});


// --- SOCKET.IO CONNECTION ---
io.on('connection', (socket) => {
  console.log('Một nhân viên đã kết nối:', socket.id);
  socket.on('disconnect', () => {
    console.log('Nhân viên đã ngắt kết nối:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`Server is running on port ${PORT}`));
// server.listen(PORT, () => console.log(`Server đang chạy tại http://localhost:${PORT}`));
