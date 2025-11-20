const express = require('express');
const { body, param } = require('express-validator');
const { verifyToken, adminOnly } = require('../middleware/authMiddleware');
const merchantController = require('../controllers/merchantController');

const router = express.Router();

// Validation middleware for creating a merchant
const validateCreateMerchant = [
    body('name')
        .isLength({ min: 3, max: 255 })
        .withMessage('Merchant name must be between 3 and 255 characters'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
];

// Validation middleware for updating a merchant
const validateUpdateMerchant = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Merchant ID must be a positive integer'),
    body('name')
        .optional()
        .isLength({ min: 3, max: 255 })
        .withMessage('Merchant name must be between 3 and 255 characters'),
    body('email')
        .optional()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address')
];

// Validation middleware for getting merchant by ID
const validateGetMerchant = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Merchant ID must be a positive integer')
];

// Validation middleware for deleting a merchant
const validateDeleteMerchant = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Merchant ID must be a positive integer')
];

// Get all merchants (Admin only)
router.get('/', 
    verifyToken,
    adminOnly,
    merchantController.getAllMerchants
);

// Get a specific merchant (Admin only)
router.get('/:id', 
    verifyToken,
    adminOnly,
    validateGetMerchant,
    merchantController.getMerchantById
);

// Create a new merchant (Admin only)
router.post('/', 
    verifyToken,
    adminOnly,
    validateCreateMerchant,
    merchantController.createMerchant
);

// Update a merchant (Admin only) - for general details like name/email
router.put('/:id',
    verifyToken,
    adminOnly,
    validateUpdateMerchant,
    merchantController.updateMerchant
);

// Update merchant status (Admin only) - for approve/reject functionality
router.put('/:id/status',
    verifyToken,
    adminOnly,
    validateGetMerchant, // reuse validation for merchant ID
    (req, res, next) => {
        // Import merchant controller to handle status update
        const merchantController = require('../controllers/merchantController');
        merchantController.updateMerchantStatus(req, res).catch(next);
    }
);

// Delete a merchant (Admin only)
router.delete('/:id',
    verifyToken,
    adminOnly,
    validateDeleteMerchant,
    merchantController.deleteMerchant
);

module.exports = router;