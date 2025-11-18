const express = require('express');
const { body, param, query } = require('express-validator');
const reviewController = require('../controllers/reviewController');
const { verifyToken, buyerOnly } = require('../middleware/authMiddleware');

const router = express.Router();

// Validation middleware for creating a review
const validateCreateReview = [
  body('transaction_id')
    .isInt({ min: 1 })
    .withMessage('Transaction ID must be a positive integer'),
  body('product_id')
    .isInt({ min: 1 })
    .withMessage('Product ID must be a positive integer'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Comment must not exceed 500 characters'),
  body('is_anonymous')
    .optional()
    .isBoolean()
    .withMessage('is_anonymous must be a boolean value')
];

// Validation middleware for updating a review
const validateUpdateReview = [
  param('reviewId')
    .isInt({ min: 1 })
    .withMessage('Review ID must be a positive integer'),
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Comment must not exceed 500 characters'),
  body('is_anonymous')
    .optional()
    .isBoolean()
    .withMessage('is_anonymous must be a boolean value')
];

// Validation middleware for getting product reviews
const validateGetProductReviews = [
  param('productId')
    .isInt({ min: 1 })
    .withMessage('Product ID must be a positive integer'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

// Validation middleware for getting user reviews
const validateGetUserReviews = [
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

// Create a new review (Buyer only)
router.post(
  '/',
  verifyToken,
  buyerOnly,
  validateCreateReview,
  reviewController.createReview
);

// Get reviews for a product
router.get(
  '/product/:productId',
  validateGetProductReviews,
  reviewController.getProductReviews
);

// Get all reviews by the authenticated user (Buyer only)
router.get(
  '/user',
  verifyToken,
  buyerOnly,
  validateGetUserReviews,
  reviewController.getUserReviews
);

// Get review details
router.get(
  '/:reviewId',
  param('reviewId').isInt({ min: 1 }).withMessage('Review ID must be a positive integer'),
  reviewController.getReview
);

// Update a review (Buyer only)
router.put(
  '/:reviewId',
  verifyToken,
  buyerOnly,
  validateUpdateReview,
  reviewController.updateReview
);

// Delete a review (Buyer only)
router.delete(
  '/:reviewId',
  verifyToken,
  buyerOnly,
  param('reviewId').isInt({ min: 1 }).withMessage('Review ID must be a positive integer'),
  reviewController.deleteReview
);

module.exports = router;