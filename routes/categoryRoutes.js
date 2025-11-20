const express = require('express');
const { body, param, query } = require('express-validator');
const categoryController = require('../controllers/categoryController');
const { verifyToken, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();

// Validation middleware for creating a category
const validateCreateCategory = [
  body('name')
    .isLength({ min: 2, max: 50 })
    .withMessage('Category name must be between 2 and 50 characters'),
  body('parent_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Parent ID must be a positive integer if provided')
];

// Validation middleware for updating a category
const validateUpdateCategory = [
  param('categoryId')
    .isInt({ min: 1 })
    .withMessage('Category ID must be a positive integer'),
  body('name')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Category name must be between 2 and 50 characters'),
  body('parent_id')
    .optional()
    .isInt({ min: 0 })  // 0 for root category
    .withMessage('Parent ID must be a non-negative integer')
];

// Validation middleware for getting categories
const validateGetCategories = [
  query('parent_id')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Parent ID must be a non-negative integer'),
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

// Get all categories (public route - no auth required)
router.get('/', validateGetCategories, categoryController.getCategories);

// Get category by ID (public route - no auth required)
router.get('/:categoryId', 
  param('categoryId')
    .isInt({ min: 1 })
    .withMessage('Category ID must be a positive integer'),
  categoryController.getCategoryById
);

// Create a new category (Admin only)
router.post(
  '/',
  verifyToken,
  adminOnly,
  validateCreateCategory,
  categoryController.createCategory
);

// Update a category (Admin only)
router.put(
  '/:categoryId',
  verifyToken,
  adminOnly,
  validateUpdateCategory,
  categoryController.updateCategory
);

// Delete a category (Admin only)
router.delete(
  '/:categoryId',
  verifyToken,
  adminOnly,
  param('categoryId')
    .isInt({ min: 1 })
    .withMessage('Category ID must be a positive integer'),
  categoryController.deleteCategory
);

module.exports = router;