// server/init-db.js
const db = require('./db');

const sqlScript = `
    -- Xóa bảng cũ nếu tồn tại để đảm bảo dữ liệu sạch
    DROP TABLE IF EXISTS order_items;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS tables;

    -- Tạo lại cấu trúc bảng
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
    CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price INTEGER NOT NULL, category_id INTEGER REFERENCES categories(id), image_url TEXT, options TEXT, is_available BOOLEAN DEFAULT TRUE);
    CREATE TABLE tables (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, table_id INTEGER REFERENCES tables(id), status TEXT NOT NULL DEFAULT 'new', total_amount INTEGER NOT NULL, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER REFERENCES products(id), quantity INTEGER NOT NULL DEFAULT 1, selected_options TEXT);

    -- Thêm dữ liệu mẫu
    INSERT INTO tables (id, name) VALUES (1, 'Bàn 1'), (2, 'Bàn 2'), (3, 'Bàn 3'), (4, 'Bàn 4'), (5, 'Bàn 5');
    
    INSERT INTO categories (name) VALUES ('Trà sữa'), ('Cà phê'), ('Bánh ngọt');

    INSERT INTO products (name, price, category_id, image_url, options) VALUES
        ('Trà Sữa Trân Châu', 45000, 1, 'https://placehold.co/100x100/EAD9D9/5C3D2E?text=Trà+Sữa', '{"Size": ["M", "L"], "Đường": ["100%", "70%", "50%"], "Đá": ["100%", "50%", "0%"]}'),
        ('Trà Đào Cam Sả', 50000, 1, 'https://placehold.co/100x100/FFDAB9/E57A00?text=Trà+Đào', '{"Size": ["M", "L"], "Đường": ["100%", "70%"], "Đá": ["100%", "50%"]}'),
        ('Cà Phê Sữa Đá', 35000, 2, 'https://placehold.co/100x100/A88B77/FFFFFF?text=Cà+Phê', '{"Đường": ["Có", "Không"], "Đá": ["Bình thường", "Ít đá"]}'),
        ('Americano', 40000, 2, 'https://placehold.co/100x100/3B2F2F/FFFFFF?text=Cà+Phê', '{"Nóng/Đá": ["Nóng", "Đá"]}'),
        ('Bánh Tiramisu', 55000, 3, 'https://placehold.co/100x100/D4B7A8/4A3728?text=Bánh', '{}');`
        ;
sqlScript_query = `SELECT * FROM products;`
try {
    db.exec(sqlScript);
    db.exec(sqlScript_query);
    console.log("Database đã được khởi tạo thành công với dữ liệu mẫu.");
} catch (err) {
    console.error("Lỗi khi khởi tạo database:", err.message);
} finally {
    // Đóng kết nối
    db.close();
}