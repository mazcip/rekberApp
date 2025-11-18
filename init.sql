-- Buat Database
CREATE DATABASE IF NOT EXISTS rekber_app_db;
USE rekber_app_db;

-- 1. Tabel Users (Induk)
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) UNIQUE NULL,
    username VARCHAR(50) UNIQUE NULL,
    password_hash VARCHAR(255) NULL,
    role ENUM('admin', 'merchant', 'buyer') NOT NULL,
    telegram_chat_id VARCHAR(50),
    otp_code VARCHAR(6) NULL, -- Untuk verifikasi OTP Telegram/Withdrawal
    otp_expires_at DATETIME NULL, -- Waktu kadaluarsa OTP
    buyer_tier ENUM('bronze', 'silver', 'gold') DEFAULT 'bronze',
    total_success_trx INT DEFAULT 0,
    is_active BOOLEAN DEFAULT FALSE, -- Kontrol status akun (KYC Approval)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Tabel Settings (Konfigurasi Admin Dinamis)
CREATE TABLE settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value TEXT,
    description VARCHAR(255)
);

-- Insert Default Settings
INSERT INTO settings (setting_key, setting_value, description) VALUES
('admin_bank_list', '["BCA", "MANDIRI", "BRI", "BNI"]', 'Daftar Bank Admin'),
('interbank_fee', '2500', 'Biaya admin beda bank'),
('admin_fee_default', '5000', 'Biaya admin standar aplikasi'),
('buyer_tier_silver_discount', '1000', 'Potongan diskon silver'),
('buyer_tier_gold_discount', '2500', 'Potongan diskon gold');


-- 3. Tabel Merchants (Profile Penjual)
CREATE TABLE merchants (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    username VARCHAR(30) UNIQUE NOT NULL, 
    shop_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(100) NOT NULL, 
    address TEXT NOT NULL,
    phone_number VARCHAR(20) NOT NULL, 
    ktp_image_url VARCHAR(255), -- URL Bukti KYC
    ijazah_image_url VARCHAR(255), -- URL Bukti KYC
    balance DECIMAL(15,2) DEFAULT 0.00,
    tier_level ENUM('bronze', 'silver', 'gold') DEFAULT 'bronze',
    bank_name VARCHAR(50), -- Data Bank Terkunci
    bank_acc_no VARCHAR(50),
    bank_acc_name VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Tabel Categories (Hierarki)
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    parent_id INT NULL,
    icon_url VARCHAR(255),
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- 5. Tabel Products - NAME
CREATE TABLE products (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    merchant_id BIGINT NOT NULL,
    category_id INT NOT NULL,
    name VARCHAR(200) NOT NULL, -- Nama Produk (Digunakan Controller)
    description TEXT,
    price DECIMAL(15,2) NOT NULL,
    stock INT DEFAULT 0,
    is_digital BOOLEAN DEFAULT TRUE, 
    status ENUM('pending', 'active', 'rejected', 'banned') DEFAULT 'pending',
    thumbnail_url VARCHAR(255), -- Foto Utama (untuk performa loading list)
    admin_note VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 5.1 Tabel Product Images (Galeri Foto)
CREATE TABLE product_images (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    image_url VARCHAR(255) NOT NULL,
    sort_order INT DEFAULT 0, -- Untuk urutan tampilan
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 6. Tabel WTB Requests (Request Barang)
CREATE TABLE wtb_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    buyer_id BIGINT NOT NULL,
    category_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    budget_min DECIMAL(15,2),
    budget_max DECIMAL(15,2),
    status ENUM('pending', 'active', 'rejected', 'closed') DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 7. Tabel Transactions (Inti Rekber) - SINKRON DENGAN LOGIKA KEUANGAN
CREATE TABLE transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL, -- Nomor unik transaksi
    buyer_id BIGINT NOT NULL,
    merchant_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    
    -- Rincian Keuangan (Diperlukan untuk Audit)
    price_per_item DECIMAL(15,2) NOT NULL, 
    subtotal DECIMAL(15,2) NOT NULL,
    app_fee DECIMAL(10,2) NOT NULL, -- Biaya Admin Aplikasi (Profit)
    tier_discount DECIMAL(10,2) NOT NULL, -- Potongan Diskon Buyer Tier
    gateway_fee DECIMAL(10,2) NOT NULL, -- Biaya Payment Gateway
    total_amount DECIMAL(15,2) NOT NULL, -- Total yang dibayar Buyer
    amount_net DECIMAL(15,2) NOT NULL, -- Bersih untuk Merchant
    
    payment_method VARCHAR(50),
    
    -- Status & Due Date -- DITAMBAH 'FAILED' DAN 'EXPIRED'
    status ENUM('UNPAID', 'PAID', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'COMPLAIN', 'CANCELLED', 'DISPUTE', 'FAILED', 'EXPIRED') DEFAULT 'UNPAID',
    duitku_ref VARCHAR(100), -- ID referensi PG
    due_date DATETIME NULL, -- Waktu batas bayar
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL, -- Waktu Selesai (Acuan Laporan Keuangan)
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 8. Tabel Reviews & Withdrawals 
CREATE TABLE reviews (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id BIGINT NOT NULL, -- FK ke transactions.id
    product_id BIGINT NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    reply_comment TEXT,
    is_anonymous BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE withdrawals (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    merchant_id BIGINT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    fee_deducted DECIMAL(10,2) DEFAULT 0, -- Biaya transfer beda bank
    status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
    proof_image VARCHAR(255), -- Bukti Transfer Admin (URL)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

-- Indexing untuk performa
CREATE INDEX idx_product_status ON products(status);
CREATE INDEX idx_trx_status ON transactions(status);
CREATE INDEX idx_merchant_username ON merchants(username);