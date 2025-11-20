const express = require('express');
const { body } = require('express-validator');
const { verifyToken, merchantOnly } = require('../middleware/authMiddleware');
const { requestWithdrawal } = require('../controllers/merchantController');

const router = express.Router();

router.post('/withdrawal',
  verifyToken,
  merchantOnly,
  body('amount').isNumeric().withMessage('Amount must be numeric'),
  requestWithdrawal
);

module.exports = router;