const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const transactionController = require('../controllers/transactionController');
const { verifyToken, buyerOnly, merchantOnly, adminOnly, merchantOrBuyer, allAuthenticated } = require('../middleware/authMiddleware');

// Validation middleware for creating a transaction
const validateCreateTransaction = [
  body('product_id')
    .isInt({ min: 1 })
    .withMessage('Product ID must be a positive integer'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('payment_method')
    .isIn(['duitku_qris', 'duitku_va', 'duitku_ewallet', 'duitku_retail'])
    .withMessage('Invalid payment method')
];

// Validation middleware for completing an order
const validateCompleteOrder = [
  body('transaction_id')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .isLength({ min: 3 })
    .withMessage('Transaction ID must be at least 3 characters long')
];

// Validation middleware for getting transaction details
const validateGetTransaction = [
  param('transaction_id')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .isLength({ min: 3 })
    .withMessage('Transaction ID must be at least 3 characters long')
];

// Validation middleware for getting user transactions
const validateGetUserTransactions = [
  query('status')
    .optional()
    .isIn(['UNPAID', 'PAID', 'PENDING', 'FAILED', 'EXPIRED', 'COMPLETED'])
    .withMessage('Invalid status value'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

// Routes

// Create a new transaction (Buyer only)
router.post(
  '/',
  verifyToken,
  buyerOnly,
  validateCreateTransaction,
  transactionController.createTransaction
);

// Payment callback webhook (public endpoint, but we'll verify signature in controller)
router.post(
  '/payment/callback',
  transactionController.paymentCallback
);

// Complete an order (Admin, Buyer, or Merchant involved in the transaction)
router.post(
  '/complete',
  verifyToken,
  allAuthenticated,
  validateCompleteOrder,
  transactionController.completeOrder
);

// Get transaction details (Admin, Buyer, or Merchant involved in the transaction)
router.get(
  '/:transaction_id',
  verifyToken,
  allAuthenticated,
  validateGetTransaction,
  transactionController.getTransactionDetails
);

// Get user transactions (Buyer or Merchant)
router.get(
  '/',
  verifyToken,
  merchantOrBuyer,
  validateGetUserTransactions,
  transactionController.getUserTransactions
);

module.exports = router;