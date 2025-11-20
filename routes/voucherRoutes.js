const express = require('express');
const router = express.Router();
const { redeemVoucher } = require('../controllers/voucherController');
const { verifyToken } = require('../middleware/authMiddleware');

// Redeem voucher route
// POST /api/buyer/redeem-voucher
router.post('/redeem-voucher', verifyToken, redeemVoucher);

module.exports = router;
