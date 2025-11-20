const express = require('express');
const { body, param, query } = require('express-validator');
const productController = require('../controllers/productController');
const { verifyToken, merchantOnly } = require('../middleware/authMiddleware');
const { uploadProductImages, handleUploadError } = require('../middleware/uploadMiddleware');

const router = express.Router();

// Validation middleware for creating a product
const validateCreateProduct = [
  body('name')
    .isLength({ min: 3, max: 255 })
    .withMessage('Product name must be between 3 and 255 characters'),
  body('description')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category_id')
    .isInt({ min: 1 })
    .withMessage('Category ID must be a positive integer'),
  body('price')
    .isFloat({ min: 0.01 })
    .withMessage('Price must be a positive number'),
  body('stock')
    .isInt({ min: 1 })
    .withMessage('Stock must be at least 1'),
  body('is_digital')
    .optional()
    .isBoolean()
    .withMessage('is_digital must be a boolean value')
];

// Validation middleware for updating a product
const validateUpdateProduct = [
  param('productId')
    .isInt({ min: 1 })
    .withMessage('Product ID must be a positive integer'),
  body('name')
    .optional()
    .isLength({ min: 3, max: 255 })
    .withMessage('Product name must be between 3 and 255 characters'),
  body('description')
    .optional()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Category ID must be a positive integer'),
  body('price')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Price must be a positive number'),
  body('stock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Stock must be a non-negative integer'),
  body('is_digital')
    .optional()
    .isBoolean()
    .withMessage('is_digital must be a boolean value')
];

// Validation middleware for getting product details
const validateGetProduct = [
  param('productId')
    .isInt({ min: 1 })
    .withMessage('Product ID must be a positive integer')
];

// Validation middleware for getting merchant products
const validateGetMerchantProducts = [
  query('status')
    .optional()
    .isIn(['pending', 'active', 'inactive', 'rejected'])
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

// Validation middleware for deleting a product
const validateDeleteProduct = [
  param('productId')
    .isInt({ min: 1 })
    .withMessage('Product ID must be a positive integer')
];

// Validation middleware for admin get products
const validateGetAllProducts = [
  query('status')
    .optional()
    .isIn(['pending', 'active', 'inactive', 'rejected'])
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

// Create a new product (Merchant only)
router.post(
  '/',
  verifyToken,
  merchantOnly,
  uploadProductImages,
  handleUploadError,
  validateCreateProduct,
  productController.createProduct
);

// Get all products for the authenticated merchant (Merchant only)
router.get(
  '/',
  verifyToken,
  merchantOnly,
  validateGetMerchantProducts,
  productController.getMerchantProducts
);

// Get product details (Merchant only)
router.get(
  '/:productId',
  verifyToken,
  merchantOnly,
  validateGetProduct,
  productController.getProductDetails
);

// Update a product (Merchant only)
router.put(
  '/:productId',
  verifyToken,
  merchantOnly,
  validateUpdateProduct,
  productController.updateProduct
);

// Delete a product (Merchant only)
router.delete(
  '/:productId',
  verifyToken,
  merchantOnly,
  validateDeleteProduct,
  productController.deleteProduct
);

module.exports = router;