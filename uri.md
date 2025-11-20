# Rekber API Documentation

This document contains all the API endpoints available in the Rekber application.

## Base URL
`http://localhost:3000/api`

## Authentication

Most endpoints require authentication using JWT tokens in the Authorization header:
```
Authorization: Bearer <your_token_here>
```

## API Endpoints

### Authentication Routes
**Base Path:** `/api/auth`

- `POST /api/auth/merchant/register` - Register a new merchant account
- `POST /api/auth/merchant/login` - Login as a merchant
- `POST /api/auth/buyer/login` - Login as a buyer
- `POST /api/auth/admin/login` - Login as an admin
- `GET /api/auth/profile` - Get authenticated user profile
- `POST /api/auth/bind-telegram` - Bind Telegram account to user
- `POST /api/auth/send-otp` - Send OTP to Telegram

### Product Routes
**Base Path:** `/api/products`

- `POST /api/products` - Create a new product (Merchant only)
- `GET /api/products` - Get all products for authenticated merchant (Merchant only)
- `GET /api/products/:productId` - Get product details (Merchant only)
- `PUT /api/products/:productId` - Update a product (Merchant only)
- `DELETE /api/products/:productId` - Delete a product (Merchant only)

### Transaction Routes
**Base Path:** `/api/transactions`

- `POST /api/transactions` - Create a new transaction (Buyer only)
- `POST /api/transactions/payment/callback` - Payment callback webhook (public)
- `POST /api/transactions/complete` - Complete an order
- `GET /api/transactions/:transaction_id` - Get transaction details (Admin, Buyer, or Merchant)
- `GET /api/transactions` - Get user transactions (Buyer or Merchant)
- `POST /api/transactions/:transaction_id/dispute` - Request dispute (Buyer only)

### Admin Routes
**Base Path:** `/api/admin`

- `POST /api/admin/verify-merchant` - Verify a merchant account (Admin only)
- `POST /api/admin/approve-product` - Approve a product (Admin only)
- `POST /api/admin/approve-withdrawal` - Approve a withdrawal request (Admin only)
- `GET /api/admin/withdrawals` - Get all withdrawals (Admin only)
- `POST /api/admin/arbitration/resolve` - Resolve dispute (Admin only)
- `GET /api/admin/arbitration` - Get arbitration list (Admin only)

### Merchant Routes
**Base Path:** `/api/merchant`

- `POST /api/merchant/withdrawal` - Request withdrawal (Merchant only)

### WTB (Want to Buy) Routes
**Base Path:** `/api/wtb`

- `POST /api/wtb` - Create a new WTB request (Buyer only)
- `GET /api/wtb` - Get all WTB requests for authenticated buyer (Buyer only)
- `GET /api/wtb/:requestId` - Get WTB request details (Buyer only)
- `PUT /api/wtb/:requestId` - Update a WTB request (Buyer only)
- `DELETE /api/wtb/:requestId` - Delete a WTB request (Buyer only)
- `GET /api/wtb/all` - Get all WTB requests (Merchant or Admin)

### Review Routes
**Base Path:** `/api/reviews`

- `POST /api/reviews` - Create a new review (Buyer only)
- `GET /api/reviews/product/:productId` - Get reviews for a product
- `GET /api/reviews/user` - Get all reviews by authenticated user (Buyer only)
- `GET /api/reviews/:reviewId` - Get review details
- `PUT /api/reviews/:reviewId` - Update a review (Buyer only)
- `DELETE /api/reviews/:reviewId` - Delete a review (Buyer only)

### Voucher Routes
**Base Path:** `/api/buyer`

- `POST /api/buyer/redeem-voucher` - Redeem a voucher (Buyer only)

### Category Routes
**Base Path:** `/api/categories`

- `GET /api/categories` - Get all categories
- `GET /api/categories/:categoryId` - Get category by ID
- `POST /api/categories` - Create a new category (Admin only)
- `PUT /api/categories/:categoryId` - Update a category (Admin only)
- `DELETE /api/categories/:categoryId` - Delete a category (Admin only)

### Chat Routes
**Base Path:** `/api/chats`

- `GET /api/chats/:roomId/messages` - Get chat history for a specific room (Authenticated user)
- `POST /api/chats/upload` - Upload chat attachment (Authenticated user)

## Public Endpoints

The following endpoints do not require authentication:

- `GET /` - Health check of the API server
- `GET /health` - Server health status
- `GET /api/categories` - Get all categories
- `GET /api/categories/:categoryId` - Get category by ID
- `GET /api/reviews/product/:productId` - Get reviews for a product
- `POST /api/transactions/payment/callback` - Payment callback webhook

## Static File Endpoints

- `/public` - Access to public files
- `/uploads` - Access to uploaded files
- `/images` - Access to chat images

## Socket.IO Events

The application also includes real-time communication via Socket.IO:

- `joinTransactionChat` - Join a transaction chat room
- `joinArbitraseChat` - Join an arbitration chat room
- `sendMessage` - Send a message to the chat room
- `leaveRoom` - Leave a chat room
- `typing` - Send typing indicator