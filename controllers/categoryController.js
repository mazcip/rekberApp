const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

// Get all categories
const getCategories = async (req, res) => {
  try {
    const { parent_id, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereClause = '';
    const replacements = {};

    if (parent_id !== undefined) {
      whereClause = 'WHERE parent_id = :parent_id';
      replacements.parent_id = parent_id;
    }

    // Get categories with pagination
    const categories = await sequelize.query(
      `SELECT c.id, c.name, c.parent_id, c.icon_url,
              (SELECT COUNT(*) FROM categories c2 WHERE c2.parent_id = c.id) as child_count,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count
       FROM categories c
       ${whereClause}
       ORDER BY c.name
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
      `SELECT COUNT(*) as total FROM categories c ${whereClause}`,
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
        categories,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: total,
          items_per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get categories',
      error: error.message
    });
  }
};

// Get category by ID
const getCategoryById = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const categories = await sequelize.query(
      `SELECT c.id, c.name, c.parent_id, c.icon_url,
              (SELECT COUNT(*) FROM categories c2 WHERE c2.parent_id = c.id) as child_count,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count
       FROM categories c
       WHERE c.id = :category_id`,
      {
        replacements: { category_id: categoryId },
        type: QueryTypes.SELECT
      }
    );

    if (categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.status(200).json({
      success: true,
      data: categories[0]
    });
  } catch (error) {
    console.error('Get category by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get category',
      error: error.message
    });
  }
};

// Create category
const createCategory = async (req, res) => {
  try {
    const { name, parent_id, icon_url } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }

    // Check if parent category exists (if parent_id is provided)
    if (parent_id) {
      const parentCategories = await sequelize.query(
        'SELECT id FROM categories WHERE id = :parent_id',
        {
          replacements: { parent_id },
          type: QueryTypes.SELECT
        }
      );

      if (parentCategories.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Parent category not found'
        });
      }
    }

    // Check if category with same name already exists at the same level
    const existingCategories = await sequelize.query(
      'SELECT id FROM categories WHERE name = :name AND parent_id = :parent_id',
      {
        replacements: { 
          name, 
          parent_id: parent_id || null 
        },
        type: QueryTypes.SELECT
      }
    );

    if (existingCategories.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists in this level'
      });
    }

    // Create category
    const categoryResult = await sequelize.query(
      `INSERT INTO categories (name, parent_id, icon_url)
       VALUES (:name, :parent_id, :icon_url)`,
      {
        replacements: {
          name,
          parent_id: parent_id || null,
          icon_url: icon_url || null
        },
        type: QueryTypes.INSERT
      }
    );

    const newCategoryId = categoryResult[0];

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: {
        id: newCategoryId,
        name,
        parent_id: parent_id || null,
        icon_url: icon_url || null
      }
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: error.message
    });
  }
};

// Update category
const updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, parent_id, icon_url } = req.body;

    // Check if category exists
    const categories = await sequelize.query(
      'SELECT id, name FROM categories WHERE id = :category_id',
      {
        replacements: { category_id: categoryId },
        type: QueryTypes.SELECT
      }
    );

    if (categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if parent category exists (if parent_id is provided)
    if (parent_id !== undefined && parent_id !== null) {
      if (parent_id != categoryId) { // Prevent circular reference
        const parentCategories = await sequelize.query(
          'SELECT id FROM categories WHERE id = :parent_id',
          {
            replacements: { parent_id },
            type: QueryTypes.SELECT
          }
        );

        if (parentCategories.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Parent category not found'
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Cannot set category as its own parent'
        });
      }
    }

    // Check if category with same name already exists at the same level (excluding current category)
    if (name) {
      const existingCategories = await sequelize.query(
        'SELECT id FROM categories WHERE name = :name AND parent_id = :parent_id AND id != :category_id',
        {
          replacements: { 
            name, 
            parent_id: parent_id !== undefined ? parent_id : categories[0].parent_id, 
            category_id: categoryId 
          },
          type: QueryTypes.SELECT
        }
      );

      if (existingCategories.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists in this level'
        });
      }
    }

    // Build update query dynamically based on provided fields
    const updateFields = [];
    const replacements = { category_id: categoryId };

    if (name !== undefined) {
      updateFields.push('name = :name');
      replacements.name = name;
    }
    if (parent_id !== undefined) {
      // If parent_id is 0, set it as NULL (to represent root category)
      updateFields.push('parent_id = :parent_id');
      replacements.parent_id = parent_id === 0 ? null : parent_id;
    }
    if (icon_url !== undefined) {
      updateFields.push('icon_url = :icon_url');
      replacements.icon_url = icon_url;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Update category
    await sequelize.query(
      `UPDATE categories SET ${updateFields.join(', ')} WHERE id = :category_id`,
      {
        replacements,
        type: QueryTypes.UPDATE
      }
    );

    res.status(200).json({
      success: true,
      message: 'Category updated successfully'
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update category',
      error: error.message
    });
  }
};

// Delete category
const deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Check if category exists
    const categories = await sequelize.query(
      'SELECT id FROM categories WHERE id = :category_id',
      {
        replacements: { category_id: categoryId },
        type: QueryTypes.SELECT
      }
    );

    if (categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if category has child categories
    const childCategories = await sequelize.query(
      'SELECT id FROM categories WHERE parent_id = :category_id',
      {
        replacements: { category_id: categoryId },
        type: QueryTypes.SELECT
      }
    );

    if (childCategories.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with child categories. Delete child categories first.'
      });
    }

    // Check if category has products assigned
    const products = await sequelize.query(
      'SELECT id FROM products WHERE category_id = :category_id',
      {
        replacements: { category_id: categoryId },
        type: QueryTypes.SELECT
      }
    );

    if (products.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with products assigned. Move/reassign products first.'
      });
    }

    // Delete category
    await sequelize.query(
      'DELETE FROM categories WHERE id = :category_id',
      {
        replacements: { category_id: categoryId },
        type: QueryTypes.DELETE
      }
    );

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category',
      error: error.message
    });
  }
};

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
};