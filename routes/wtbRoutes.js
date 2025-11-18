const express = require('express');
const { body, param, query } = require('express-validator');
const wtbController = require('../controllers/wtbController');
const { verifyToken, buyerOnly } = require('../middleware/authMiddleware');

const router = express.Router();

// Validation middleware for creating a WTB request
const validateCreateWtbRequest = [
  body('category_id')
    .isInt({ min: 1 })
    .withMessage('Category ID must be a positive integer'),
  body('title')
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('description')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('budget_min')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum budget must be a non-negative number'),
  body('budget_max')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum budget must be a non-negative number')
];

// Validation middleware for updating a WTB request
const validateUpdateWtbRequest = [
  param('requestId')
    .isInt({ min: 1 })
    .withMessage('Request ID must be a positive integer'),
  body('title')
    .optional()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('description')
    .optional()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('budget_min')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum budget must be a non-negative number'),
  body('budget_max')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum budget must be a non-negative number'),
  body('status')
    .optional()
    .isIn(['pending', 'active', 'rejected', 'closed'])
    .withMessage('Invalid status value')
];

// Validation middleware for getting WTB requests
const validateGetWtbRequests = [
  query('status')
    .optional()
    .isIn(['pending', 'active', 'rejected', 'closed'])
    .withMessage('Invalid status value'),
  query('category_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Category ID must be a positive integer'),
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

// Create a new WTB request (Buyer only)
router.post(
  '/',
  verifyToken,
  buyerOnly,
  validateCreateWtbRequest,
  wtbController.createWtbRequest
);

// Get all WTB requests for the authenticated buyer (Buyer only)
router.get(
  '/',
  verifyToken,
  buyerOnly,
  validateGetWtbRequests,
  wtbController.getBuyerWtbRequests
);

// Get WTB request details (Buyer only)
router.get(
  '/:requestId',
  verifyToken,
  buyerOnly,
  param('requestId').isInt({ min: 1 }).withMessage('Request ID must be a positive integer'),
  wtbController.getWtbRequest
);

// Update a WTB request (Buyer only)
router.put(
  '/:requestId',
  verifyToken,
  buyerOnly,
  validateUpdateWtbRequest,
  wtbController.updateWtbRequest
);

// Delete a WTB request (Buyer only)
router.delete(
  '/:requestId',
  verifyToken,
  buyerOnly,
  param('requestId').isInt({ min: 1 }).withMessage('Request ID must be a positive integer'),
  wtbController.deleteWtbRequest
);

// Additional route for merchants/admins to view all WTB requests
router.get(
  '/all',
  verifyToken,
  // Allow both merchants and admins to see these routes
  (req, res, next) => {
    const role = req.user.role;
    if (role !== 'merchant' && role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This endpoint is for merchants and admins only.'
      });
    }
    next();
  },
  validateGetWtbRequests,
  wtbController.getAllWtbRequests
);

module.exports = router;