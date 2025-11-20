const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { verifyToken, allAuthenticated } = require('../middleware/authMiddleware');
const { uploadMerchantDocuments, handleUploadError } = require('../middleware/uploadMiddleware');

// Validation middleware
const validateMerchantRegistration = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  
  body('shop_name')
    .notEmpty()
    .withMessage('Shop name is required')
    .isLength({ max: 100 })
    .withMessage('Shop name must not exceed 100 characters'),
  
  body('full_name')
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ max: 100 })
    .withMessage('Full name must not exceed 100 characters'),
  
  body('address')
    .notEmpty()
    .withMessage('Address is required'),
  
  body('phone_number')
    .notEmpty()
    .withMessage('Phone number is required')
    .isMobilePhone()
    .withMessage('Invalid phone number format'),
  
  body('bank_name')
    .notEmpty()
    .withMessage('Bank name is required'),
  
  body('bank_acc_no')
    .notEmpty()
    .withMessage('Bank account number is required'),
  
  body('bank_acc_name')
    .notEmpty()
    .withMessage('Bank account name is required')
];

const validateMerchantLogin = [
  body('username')
    .notEmpty()
    .withMessage('Username is required'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const validateBuyerLogin = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
];

const validateAdminLogin = [
  body('username')
    .notEmpty()
    .withMessage('Username is required'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Public routes
router.post('/merchant/register', uploadMerchantDocuments, handleUploadError, validateMerchantRegistration, authController.registerMerchant);
router.post('/merchant/login', validateMerchantLogin, authController.loginMerchant);
router.post('/buyer/login', validateBuyerLogin, authController.loginBuyer);
router.post('/admin/login', validateAdminLogin, authController.loginAdmin);

// Initial admin setup (only allowed if no admin exists)
router.post('/admin/initial-setup', validateAdminLogin, authController.initialAdminSetup);

// Logout route (just returns success, client handles token removal)
router.post('/logout', (req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
});

// Protected routes
router.get('/profile', verifyToken, allAuthenticated, authController.getProfile);

// Telegram integration routes
router.post('/bind-telegram', 
  verifyToken, 
  allAuthenticated,
  body('chat_id').notEmpty().withMessage('Chat ID is required'),
  authController.bindTelegram
);

router.post('/send-otp', 
  verifyToken, 
  allAuthenticated,
  body('chat_id').notEmpty().withMessage('Chat ID is required'),
  authController.sendOTP
);

module.exports = router;