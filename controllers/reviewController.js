const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

// Create Review
const createReview = async (req, res) => {
  try {
    const { transaction_id, product_id, rating, comment, is_anonymous } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!transaction_id || !product_id || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID, product ID, and rating are required'
      });
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Check if transaction exists and was made by this user
    const transactions = await sequelize.query(
      'SELECT id, status FROM transactions WHERE id = :transaction_id AND buyer_id = :user_id',
      {
        replacements: {
          transaction_id,
          user_id: userId
        },
        type: QueryTypes.SELECT
      }
    );

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or does not belong to user'
      });
    }

    const transaction = transactions[0];

    // Only allow reviews for completed transactions
    if (transaction.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Reviews can only be submitted for completed transactions'
      });
    }

    // Check if user already reviewed this transaction/product
    const existingReviews = await sequelize.query(
      'SELECT id FROM reviews WHERE transaction_id = :transaction_id AND product_id = :product_id',
      {
        replacements: {
          transaction_id,
          product_id
        },
        type: QueryTypes.SELECT
      }
    );

    if (existingReviews.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Review already exists for this transaction and product'
      });
    }

    // Create review
    const result = await sequelize.query(
      `INSERT INTO reviews (transaction_id, product_id, rating, comment, is_anonymous)
       VALUES (:transaction_id, :product_id, :rating, :comment, :is_anonymous)`,
      {
        replacements: {
          transaction_id,
          product_id,
          rating,
          comment: comment || null,
          is_anonymous: is_anonymous || false
        },
        type: QueryTypes.INSERT
      }
    );

    const reviewId = result[0];

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: {
        id: reviewId,
        transaction_id,
        product_id,
        rating,
        comment,
        is_anonymous: is_anonymous || false,
        created_at: new Date()
      }
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create review',
      error: error.message
    });
  }
};

// Get reviews for a product
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Get reviews for the product with pagination
    const reviews = await sequelize.query(
      `SELECT r.id, r.rating, r.comment, r.is_anonymous, r.created_at,
              CASE WHEN r.is_anonymous = TRUE THEN 'Anonymous' ELSE u.username END as reviewer_name
       FROM reviews r
       LEFT JOIN transactions t ON r.transaction_id = t.id
       LEFT JOIN users u ON t.buyer_id = u.id
       WHERE r.product_id = :product_id
       ORDER BY r.created_at DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements: {
          product_id: productId,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        type: QueryTypes.SELECT
      }
    );

    // Get total count for pagination
    const totalCount = await sequelize.query(
      'SELECT COUNT(*) as total FROM reviews WHERE product_id = :product_id',
      {
        replacements: { product_id: productId },
        type: QueryTypes.SELECT
      }
    );

    // Get average rating
    const avgRatingResult = await sequelize.query(
      'SELECT AVG(rating) as avg_rating FROM reviews WHERE product_id = :product_id',
      {
        replacements: { product_id: productId },
        type: QueryTypes.SELECT
      }
    );

    const total = totalCount[0].total;
    const totalPages = Math.ceil(total / limit);
    const avgRating = avgRatingResult[0].avg_rating ? parseFloat(avgRatingResult[0].avg_rating).toFixed(1) : 0;

    res.status(200).json({
      success: true,
      data: {
        reviews,
        average_rating: parseFloat(avgRating),
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: total,
          items_per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get product reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get product reviews',
      error: error.message
    });
  }
};

// Get user's reviews
const getUserReviews = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Get reviews by the user with pagination
    const reviews = await sequelize.query(
      `SELECT r.id, r.rating, r.comment, r.is_anonymous, r.created_at,
              p.name as product_name, p.thumbnail_url, t.invoice_number
       FROM reviews r
       JOIN transactions t ON r.transaction_id = t.id
       JOIN products p ON r.product_id = p.id
       WHERE t.buyer_id = :user_id
       ORDER BY r.created_at DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements: {
          user_id: userId,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        type: QueryTypes.SELECT
      }
    );

    // Get total count for pagination
    const totalCount = await sequelize.query(
      `SELECT COUNT(*) as total FROM reviews r
       JOIN transactions t ON r.transaction_id = t.id
       WHERE t.buyer_id = :user_id`,
      {
        replacements: { user_id: userId },
        type: QueryTypes.SELECT
      }
    );

    const total = totalCount[0].total;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        reviews,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: total,
          items_per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user reviews',
      error: error.message
    });
  }
};

// Get review by ID
const getReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    // Get review details
    const reviews = await sequelize.query(
      `SELECT r.*, p.name as product_name, u.username as reviewer_name
       FROM reviews r
       JOIN transactions t ON r.transaction_id = t.id
       JOIN products p ON r.product_id = p.id
       JOIN users u ON t.buyer_id = u.id
       WHERE r.id = :review_id`,
      {
        replacements: { review_id: reviewId },
        type: QueryTypes.SELECT
      }
    );

    if (reviews.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    const review = reviews[0];

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    console.error('Get review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get review',
      error: error.message
    });
  }
};

// Update review
const updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment, is_anonymous } = req.body;
    const userId = req.user.id;

    // Check if review exists and was created by this user
    const reviews = await sequelize.query(
      `SELECT r.id FROM reviews r
       JOIN transactions t ON r.transaction_id = t.id
       WHERE r.id = :review_id AND t.buyer_id = :user_id`,
      {
        replacements: { review_id: reviewId, user_id: userId },
        type: QueryTypes.SELECT
      }
    );

    if (reviews.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Review not found or does not belong to user'
      });
    }

    // Build update query dynamically based on provided fields
    const updateFields = [];
    const replacements = {
      review_id: reviewId
    };

    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
      }
      updateFields.push('rating = :rating');
      replacements.rating = rating;
    }
    if (comment !== undefined) {
      updateFields.push('comment = :comment');
      replacements.comment = comment;
    }
    if (is_anonymous !== undefined) {
      updateFields.push('is_anonymous = :is_anonymous');
      replacements.is_anonymous = is_anonymous;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Update review
    await sequelize.query(
      `UPDATE reviews SET ${updateFields.join(', ')} WHERE id = :review_id`,
      {
        replacements,
        type: QueryTypes.UPDATE
      }
    );

    res.status(200).json({
      success: true,
      message: 'Review updated successfully'
    });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review',
      error: error.message
    });
  }
};

// Delete review
const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;

    // Check if review exists and was created by this user
    const reviews = await sequelize.query(
      `SELECT r.id FROM reviews r
       JOIN transactions t ON r.transaction_id = t.id
       WHERE r.id = :review_id AND t.buyer_id = :user_id`,
      {
        replacements: { review_id: reviewId, user_id: userId },
        type: QueryTypes.SELECT
      }
    );

    if (reviews.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Review not found or does not belong to user'
      });
    }

    // Delete review
    await sequelize.query(
      'DELETE FROM reviews WHERE id = :review_id',
      {
        replacements: { review_id: reviewId },
        type: QueryTypes.DELETE
      }
    );

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review',
      error: error.message
    });
  }
};

module.exports = {
  createReview,
  getProductReviews,
  getUserReviews,
  getReview,
  updateReview,
  deleteReview
};