const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const { getFileUrl } = require('../middleware/uploadMiddleware');

// Create Product
const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      category_id,
      price,
      stock,
      is_digital
    } = req.body;

    // Get merchant ID from authenticated user
    const merchantId = req.user.merchant_id;
    if (!merchantId) {
      return res.status(403).json({
        success: false,
        message: 'Merchant account not found'
      });
    }

    // Get uploaded files
    const files = req.files;
    const productImages = [];

    // Collect all uploaded product images (max 4)
    for (let i = 1; i <= 4; i++) {
      const fieldName = `product_image${i}`;
      if (files && files[fieldName] && files[fieldName].length > 0) {
        productImages.push(files[fieldName][0]);
      }
    }

    // Validate that no more than 4 images were uploaded
    if (productImages.length > 4) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 4 product images allowed per product'
      });
    }

    // Validate required fields
    if (!name || !description || !category_id || !price) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    // Validate at least one image is uploaded
    if (productImages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product image is required'
      });
    }

    // Set default values
    const isDigitalValue = is_digital !== undefined ? is_digital : true;

    // Start transaction
    const t = await sequelize.transaction();

    try {
      // Get file URL for thumbnail (first image)
      const thumbnailUrl = getFileUrl(productImages[0].path);

      // Create product record
      const productResult = await sequelize.query(
        `INSERT INTO products
         (merchant_id, category_id, name, description, price, stock, is_digital, thumbnail_url, status)
         VALUES (:merchant_id, :category_id, :name, :description, :price, :stock, :is_digital, :thumbnail_url, 'pending')`,
        {
          replacements: {
            merchant_id: merchantId,
            category_id,
            name,
            description,
            price,
            stock: stock || 0,
            is_digital: isDigitalValue,
            thumbnail_url: thumbnailUrl
          },
          type: QueryTypes.INSERT,
          transaction: t
        }
      );

      const productId = productResult[0];

      // Insert all uploaded product images into product_images table
      for (let i = 0; i < productImages.length; i++) {
        const imageUrl = getFileUrl(productImages[i].path);
        await sequelize.query(
          `INSERT INTO product_images (product_id, image_url, sort_order)
           VALUES (:product_id, :image_url, :sort_order)`,
          {
            replacements: {
              product_id: productId,
              image_url: imageUrl,
              sort_order: i
            },
            type: QueryTypes.INSERT,
            transaction: t
          }
        );
      }

      // Commit transaction
      await t.commit();

      res.status(201).json({
        success: true,
        message: 'Product created successfully. It is now pending admin approval.',
        data: {
          id: productId,
          name,
          category_id,
          price,
          stock: stock || 0,
          is_digital: isDigitalValue,
          status: 'pending',
          thumbnail_url: thumbnailUrl
        }
      });
    } catch (error) {
      // Rollback transaction on error
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
};

// Get Products (for authenticated merchant)
const getMerchantProducts = async (req, res) => {
  try {
    const merchantId = req.user.merchant_id;
    if (!merchantId) {
      return res.status(403).json({
        success: false,
        message: 'Merchant account not found'
      });
    }

    // Get query parameters for filtering and pagination
    const { status, category_id, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereClause = 'WHERE p.merchant_id = :merchant_id';
    const replacements = { merchant_id: merchantId };

    if (status) {
      whereClause += ' AND p.status = :status';
      replacements.status = status;
    }

    if (category_id) {
      whereClause += ' AND p.category_id = :category_id';
      replacements.category_id = category_id;
    }

    // Get products with pagination
    const products = await sequelize.query(
      `SELECT p.id, p.name, p.description, p.category_id, p.price, p.stock,
              p.is_digital, p.thumbnail_url, p.status, p.created_at, p.updated_at,
              (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as avg_rating,
              (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count
       FROM products p
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements: {
          ...replacements,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        type: QueryTypes.SELECT
      }
    );

    // Get total count for pagination
    const totalCount = await sequelize.query(
      `SELECT COUNT(*) as total FROM products p ${whereClause}`,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    const total = totalCount[0].total;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        products,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: total,
          items_per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get merchant products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get products',
      error: error.message
    });
  }
};

// Get Product Details
const getProductDetails = async (req, res) => {
  try {
    const { productId } = req.params;
    const merchantId = req.user.merchant_id;

    // Get product details
    const products = await sequelize.query(
      `SELECT p.id, p.name, p.description, p.category_id, p.price, p.stock,
              p.is_digital, p.thumbnail_url, p.status, p.created_at, p.updated_at,
              (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as avg_rating,
              (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count
       FROM products p
       WHERE p.id = :product_id AND p.merchant_id = :merchant_id`,
      {
        replacements: {
          product_id: productId,
          merchant_id: merchantId
        },
        type: QueryTypes.SELECT
      }
    );

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const product = products[0];

    // Get product images from product_images table
    const images = await sequelize.query(
      `SELECT image_url, sort_order
       FROM product_images
       WHERE product_id = :product_id
       ORDER BY sort_order ASC`,
      {
        replacements: {
          product_id: product.id
        },
        type: QueryTypes.SELECT
      }
    );

    res.status(200).json({
      success: true,
      data: {
        ...product,
        images
      }
    });
  } catch (error) {
    console.error('Get product details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get product details',
      error: error.message
    });
  }
};

// Update Product
const updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const merchantId = req.user.merchant_id;
    
    const {
      name,
      description,
      category_id,
      price,
      stock,
      is_digital
    } = req.body;

    // Check if product exists and belongs to merchant
    const products = await sequelize.query(
      'SELECT id FROM products WHERE id = :product_id AND merchant_id = :merchant_id',
      {
        replacements: {
          product_id: productId,
          merchant_id: merchantId
        },
        type: QueryTypes.SELECT
      }
    );

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Build update query dynamically based on provided fields
    // Validate allowed fields to prevent SQL injection
    const allowedFields = {
      'name': 'name',
      'description': 'description',
      'category_id': 'category_id',
      'price': 'price',
      'stock': 'stock',
      'is_digital': 'is_digital'
    };

    const updateFields = [];
    const replacements = {
      product_id: productId,
      updated_at: new Date()
    };

    // Only allow specific fields to be updated
    if (name !== undefined) {
      updateFields.push('name = :name');
      // Validate the input
      if (typeof name !== 'string' || name.length < 3 || name.length > 255) {
        return res.status(400).json({
          success: false,
          message: 'Product name must be between 3 and 255 characters'
        });
      }
      replacements.name = name;
    }
    if (description !== undefined) {
      updateFields.push('description = :description');
      // Validate the input
      if (typeof description !== 'string' || description.length < 10 || description.length > 2000) {
        return res.status(400).json({
          success: false,
          message: 'Description must be between 10 and 2000 characters'
        });
      }
      replacements.description = description;
    }
    if (category_id !== undefined) {
      updateFields.push('category_id = :category_id');
      // Validate the input is a number
      if (!Number.isInteger(parseInt(category_id)) || parseInt(category_id) < 1) {
        return res.status(400).json({
          success: false,
          message: 'Category ID must be a positive integer'
        });
      }
      replacements.category_id = parseInt(category_id);
    }
    if (price !== undefined) {
      updateFields.push('price = :price');
      // Validate the input is a positive number
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0.01) {
        return res.status(400).json({
          success: false,
          message: 'Price must be a positive number'
        });
      }
      replacements.price = priceNum;
    }
    if (stock !== undefined) {
      updateFields.push('stock = :stock');
      // Validate the input is a non-negative integer
      const stockInt = parseInt(stock);
      if (isNaN(stockInt) || stockInt < 0) {
        return res.status(400).json({
          success: false,
          message: 'Stock must be a non-negative integer'
        });
      }
      replacements.stock = stockInt;
    }
    if (is_digital !== undefined) {
      updateFields.push('is_digital = :is_digital');
      // Validate the input is a boolean
      if (typeof is_digital !== 'boolean' && is_digital !== 'true' && is_digital !== 'false' && is_digital !== 1 && is_digital !== 0) {
        return res.status(400).json({
          success: false,
          message: 'is_digital must be a boolean value'
        });
      }
      replacements.is_digital = Boolean(is_digital);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateFields.push('updated_at = :updated_at');

    // Update product
    await sequelize.query(
      `UPDATE products SET ${updateFields.join(', ')} WHERE id = :product_id`,
      {
        replacements,
        type: QueryTypes.UPDATE
      }
    );

    res.status(200).json({
      success: true,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
};

// Delete Product
const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const merchantId = req.user.merchant_id;

    // Check if product exists and belongs to merchant
    const products = await sequelize.query(
      'SELECT id, status FROM products WHERE id = :product_id AND merchant_id = :merchant_id',
      {
        replacements: {
          product_id: productId,
          merchant_id: merchantId
        },
        type: QueryTypes.SELECT
      }
    );

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const product = products[0];

    // Check if product can be deleted (not in active transaction)
    if (product.status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete active product. Please deactivate it first.'
      });
    }

    // Start transaction
    const t = await sequelize.transaction();

    try {
      // Delete associated product images first
      await sequelize.query(
        'DELETE FROM product_images WHERE product_id = :product_id',
        {
          replacements: { product_id: productId },
          type: QueryTypes.DELETE,
          transaction: t
        }
      );

      // Delete product
      await sequelize.query(
        'DELETE FROM products WHERE id = :product_id',
        {
          replacements: { product_id: productId },
          type: QueryTypes.DELETE,
          transaction: t
        }
      );

      // Commit transaction
      await t.commit();

      res.status(200).json({
        success: true,
        message: 'Product deleted successfully'
      });
    } catch (error) {
      // Rollback transaction on error
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
};

// Get Pending Products for Admin
const getPendingProducts = async (req, res) => {
  try {
    // Get products with pending status
    const products = await sequelize.query(
      `SELECT p.id, p.name, p.description, p.category_id, p.price, p.stock,
              p.is_digital, p.thumbnail_url, p.status, p.created_at, p.merchant_id,
              m.shop_name as merchant_name, m.username as merchant_username,
              c.name as category_name
       FROM products p
       JOIN merchants m ON p.merchant_id = m.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.status = 'pending'
       ORDER BY p.created_at DESC`,
      {
        type: QueryTypes.SELECT
      }
    );

    res.status(200).json({
      success: true,
      data: {
        products: products,
        count: products.length
      }
    });
  } catch (error) {
    console.error('Get pending products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending products',
      error: error.message
    });
  }
};

// Get All Products for Admin
const getAllProducts = async (req, res) => {
  try {
    // Get query parameters for filtering and pagination
    const { status, category_id, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereClause = '';
    const replacements = {};

    if (status) {
      whereClause += 'WHERE p.status = :status';
      replacements.status = status;
    }

    if (category_id) {
      if (whereClause) {
        whereClause += ' AND p.category_id = :category_id';
      } else {
        whereClause = 'WHERE p.category_id = :category_id';
      }
      replacements.category_id = category_id;
    }

    // Get products with pagination
    const products = await sequelize.query(
      `SELECT p.id, p.name, p.description, p.category_id, p.price, p.stock,
              p.is_digital, p.thumbnail_url, p.status, p.created_at, p.updated_at,
              m.store_name as merchant_name,
              c.name as category_name,
              (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as avg_rating,
              (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count
       FROM products p
       LEFT JOIN merchants m ON p.merchant_id = m.id
       LEFT JOIN categories c ON p.category_id = c.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements: {
          ...replacements,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        type: QueryTypes.SELECT
      }
    );

    // Get total count for pagination
    const totalCount = await sequelize.query(
      `SELECT COUNT(*) as total FROM products p ${whereClause}`,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    const total = totalCount[0].total;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        products,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: total,
          items_per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get products',
      error: error.message
    });
  }
};

module.exports = {
  createProduct,
  getMerchantProducts,
  getProductDetails,
  updateProduct,
  deleteProduct,
  getPendingProducts,
  getAllProducts
};