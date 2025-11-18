MASTER CONTEXT: Managed Digital Marketplace & Escrow Platform (Rekber)

1. Project Overview

We are building a highly secure Managed Marketplace & Escrow (Rekber) Platform specialized for digital products (games, vouchers, accounts) and physical goods. The system emphasizes strict admin curation (KYC), transaction safety, and user loyalty.

Core Philosophy

Managed: Merchants, Products, and WTB requests must be approved by the Admin.

Escrow: Funds are held by the system until the buyer confirms receipt.

Single SKU Transaction: A cart can only contain multiple quantities of a single product type per transaction (Atomic transaction).

2. Tech Stack Specifications

Backend: Node.js (Express.js).

Database: MySQL (Relational Database).

Mobile Apps: Flutter (Single codebase for two apps: Merchant App & Buyer App).

Admin Panel: React.js (Web Dashboard).

Infrastructure: VPS (Ubuntu), Nginx (No Docker for initial phase).

3rd Party Integrations:

Payment Gateway: Duitku API.

Notifications & OTP: Telegram Bot API.

Storage: Local storage (public folder) or Object Storage for images.

3. Database Schema (ERD) Blueprint

The database must support the following structure. Use English for table/column names.

A. Users & Auth

users:

id (PK), email (Unique, Nullable - for Buyer Google Auth), username (Unique, Nullable - for Merchant Login), password_hash (Nullable - for Merchant), role ('admin', 'merchant', 'buyer'), telegram_chat_id (Nullable), buyer_tier ('bronze', 'silver', 'gold'), total_success_trx (Counter), is_active (Boolean - Default false for merchant, true for buyer), created_at.

B. Merchant Data (KYC & Profile)

merchants:

id (PK), user_id (FK), username (Unique slug for Deep Link e.g., https://www.google.com/search?q=app.com/storename), shop_name, full_name (Real name per KTP), address, phone_number (WhatsApp), ktp_image_url, ijazah_image_url, balance (Decimal), tier_level ('bronze', 'silver', 'gold'), bank_name, bank_acc_no, bank_acc_name (Locked by Admin).

C. Products & Images

categories:

id (PK), name, parent_id (Self-referencing), icon_url.

products:

id (PK), merchant_id (FK), category_id (FK), title, description, price, stock, is_digital (Boolean), status ('pending', 'active', 'rejected', 'banned'), thumbnail_url (Main display image), admin_note.

product_images:

id (PK), product_id (FK), image_url, sort_order (1-4).

Constraint: Maximum 4 images per product.

D. WTB (Want to Buy)

wtb_requests:

id (PK), buyer_id (FK), category_id (FK), title, description, budget_min, budget_max, status ('pending', 'active', 'rejected', 'closed').

E. Transactions (Escrow Logic)

transactions:

id (PK), invoice_no, buyer_id, merchant_id, product_id, quantity, total_pay (Grand total), amount_net (Merchant receives), admin_fee (App profit), payment_fee (Gateway fee), payment_method, status ('UNPAID', 'PAID', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'COMPLAIN', 'CANCELLED', 'DISPUTE'), duitku_ref.

transaction_logs: Audit trail.

F. Features & Finance

chats: id, transaction_id, type ('private', 'arbitrase').

chat_messages: id, chat_id, sender_id, message, attachment.

reviews: id, transaction_id, rating (1-5), comment, reply_comment, is_anonymous.

withdrawals: id, merchant_id, amount, fee_deducted, status, proof_image.

settings: Key-Value store for Admin Configs (e.g., buyer_tier_gold_discount, admin_bank_list, interbank_fee).

4. Key Business Logic & Flows

A. Merchant Onboarding (KYC Flow)

Registration: Merchant fills form in App (Name, Address, Shop Name, Shop Username, Password, Bank Data).

Document Upload: Merchant uploads KTP and Ijazah photos (Multipart form).

Pending State: Account is created but is_active = false. Merchant cannot login yet.

Admin Review: Admin checks documents in Dashboard.

Approve: is_active = true. Admin manually notifies Merchant via WhatsApp.

Reject: Data deleted or flagged.

Login: Merchant logs in using Username + Password.

Telegram Binding: After first login, Merchant binds Telegram Bot for OTP.

B. Product Management

Upload: Merchant inputs Title, Desc, Price, Stock, and Max 4 Images.

Thumbnail: The first uploaded image is saved to product_images AND products.thumbnail_url (for query performance).

Moderation: Products enter PENDING status. Admin must Approve to make them ACTIVE.

C. Transaction & Fees

Formula: Total = (Price * Qty) + (AppFee - BuyerTierDiscount) + GatewayFee.

Stock Lock: Atomic decrement of stock upon Checkout.

Escrow: Money is released to Merchant Balance only when status is COMPLETED.

D. Withdrawal (Finance)

Security: Merchant must input OTP sent to their Telegram Bot.

Fee Logic:

If Merchant Bank is in settings.admin_bank_list (The main 4 banks): Fee = 0.

If Merchant Bank is different: Fee = 2500 (Deducted from withdrawal amount).

E. Tiering System

Merchant Tier (Auto): Based on total sales count. Benefits: Lower selling fees.

Buyer Tier (Admin Controlled):

Logic: Based on total_success_trx.

Config: Admin edits settings table to define thresholds and discount amounts.

F. Security Features

Chat Filter: Regex censor for phone numbers/external links in Chat.

Deep Linking: domain.com/username redirects to the Merchant's store in the App.

5. Instructions for Generation

Based on the context above, please generate:

Project Directory Structure for the Node.js Backend.

SQL Script (init.sql) to create the complete database with relationships and indexes (Include product_images table).

Package.json with necessary dependencies.

Controller Logic Snippet for createProduct (Handling Max 4 images) and registerMerchant (Handling KYC upload).