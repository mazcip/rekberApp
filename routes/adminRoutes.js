const express = require('express');
const { body } = require('express-validator');
const { verifyToken, adminOnly } = require('../middleware/authMiddleware');
const { verifyMerchant, approveProduct, approveWithdrawal } = require('../controllers/adminController');

const router = express.Router();

router.post('/verify-merchant', 
  verifyToken, 
  adminOnly,
  body('merchant_id').isInt().withMessage('Merchant ID must be an integer'),
  verifyMerchant
);

router.post('/approve-product', 
  verifyToken, 
  adminOnly,
  body('product_id').isInt().withMessage('Product ID must be an integer'),
  approveProduct
);

router.post('/approve-withdrawal', 
  verifyToken, 
  adminOnly,
  body('withdrawal_id').isInt().withMessage('Withdrawal ID must be an integer'),
  approveWithdrawal
);

module.exports = router;