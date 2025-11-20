const express = require('express');
const { body } = require('express-validator');
const { verifyToken, adminOnly } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Verify Merchant
router.post('/verify-merchant',
  verifyToken,
  adminOnly,
  body('merchant_id').optional().isInt().withMessage('Merchant ID must be an integer'),
  body('username').optional().isLength({ min: 3 }).withMessage('Username is required'),
  adminController.verifyMerchant
);

// Approve Product
router.post('/approve-product',
  verifyToken,
  adminOnly,
  body('product_id').isInt().withMessage('Product ID must be an integer'),
  adminController.approveProduct
);

// Approve Withdrawal
router.post('/approve-withdrawal',
  verifyToken,
  adminOnly,
  body('withdrawal_id').isInt().withMessage('Withdrawal ID must be an integer'),
  adminController.approveWithdrawal
);

// List Withdrawals
router.get('/withdrawals',
  verifyToken,
  adminOnly,
  adminController.listWithdrawals
);

// Get Single Withdrawal
router.get('/withdrawals/:id',
  verifyToken,
  adminOnly,
  (req, res, next) => {
    // Import admin controller to handle single withdrawal
    const adminController = require('../controllers/adminController');
    adminController.getSingleWithdrawal(req, res).catch(next);
  }
);

// Resolve Dispute
router.post('/arbitration/resolve',
  verifyToken,
  adminOnly,
  body('transactionId').notEmpty().withMessage('Transaction ID is required'),
  body('decision').isIn(['refund', 'release']).withMessage('Decision must be either "refund" or "release"'),
  body('admin_note').optional().isLength({ max: 500 }).withMessage('Admin note must be less than 500 characters'),
  adminController.resolveDispute
);

// Get Arbitration List
router.get('/arbitration',
  verifyToken,
  adminOnly,
  adminController.getArbitrationList
);

// Get Single Arbitration (by transaction invoice number)
router.get('/arbitration/:invoiceNumber',
  verifyToken,
  adminOnly,
  (req, res, next) => {
    // Import admin controller to handle single arbitration
    const adminController = require('../controllers/adminController');
    adminController.getSingleArbitration(req, res).catch(next);
  }
);

// Update Arbitration (placeholder - may be used for adding notes or comments)
// Currently, arbitration resolution is handled separately via resolveDispute
// This could be extended for admin comments or status updates
router.put('/arbitration/:invoiceNumber',
  verifyToken,
  adminOnly,
  (req, res, next) => {
    // For now, this could just be a passthrough to resolveDispute
    // Import admin controller to handle arbitration update
    const adminController = require('../controllers/adminController');
    adminController.updateArbitration(req, res).catch(next);
  }
);

// Get Pending Merchants
router.get('/merchants/pending',
  verifyToken,
  adminOnly,
  adminController.getPendingMerchants
);

// Get All Products
router.get('/products',
  verifyToken,
  adminOnly,
  (req, res, next) => {
    // Import admin controller to get all products
    const adminController = require('../controllers/adminController');
    adminController.getAllProducts(req, res).catch(next);
  }
);

// Get Pending Products
router.get('/products/pending',
  verifyToken,
  adminOnly,
  (req, res, next) => {
    // Import product controller to avoid circular dependency
    const productController = require('../controllers/productController');
    productController.getPendingProducts(req, res).catch(next);
  }
);

// Get Pending WTB Requests
router.get('/wtb/pending',
  verifyToken,
  adminOnly,
  (req, res, next) => {
    // Import wtb controller to avoid circular dependency
    const wtbController = require('../controllers/wtbController');
    wtbController.getPendingWtbRequests(req, res).catch(next);
  }
);

// Update WTB Request Status (Approve/Reject)
router.put('/wtb/:requestId/status',
  verifyToken,
  adminOnly,
  (req, res, next) => {
    // Import wtb controller to avoid circular dependency
    const wtbController = require('../controllers/wtbController');
    wtbController.updateWtbRequestStatus(req, res).catch(next);
  }
);

// Category Management Routes
// Get all categories
router.get('/categories',
  verifyToken,
  adminOnly,
  (req, res, next) => {
    const categoryController = require('../controllers/categoryController');
    categoryController.getCategories(req, res).catch(next);
  }
);

// Create category
router.post('/categories',
  verifyToken,
  adminOnly,
  (req, res, next) => {
    const categoryController = require('../controllers/categoryController');
    categoryController.createCategory(req, res).catch(next);
  }
);

// Update category
router.put('/categories/:categoryId',
  verifyToken,
  adminOnly,
  (req, res, next) => {
    const categoryController = require('../controllers/categoryController');
    categoryController.updateCategory(req, res).catch(next);
  }
);

// Delete category
router.delete('/categories/:categoryId',
  verifyToken,
  adminOnly,
  (req, res, next) => {
    const categoryController = require('../controllers/categoryController');
    categoryController.deleteCategory(req, res).catch(next);
  }
);

module.exports = router;