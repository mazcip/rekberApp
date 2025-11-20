const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

// Create WTB Request
const createWtbRequest = async (req, res) => {
  try {
    const { category_id, title, description, budget_min, budget_max } = req.body;
    const buyerId = req.user.id;

    // Validate required fields
    if (!category_id || !title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Category ID, title, and description are required'
      });
    }

    // Validate budget values if provided
    if (budget_min !== undefined && budget_max !== undefined && budget_min > budget_max) {
      return res.status(400).json({
        success: false,
        message: 'Minimum budget cannot be greater than maximum budget'
      });
    }

    // Check if category exists
    const categories = await sequelize.query(
      'SELECT id FROM categories WHERE id = :category_id',
      {
        replacements: { category_id },
        type: QueryTypes.SELECT
      }
    );

    if (categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Create WTB request
    const result = await sequelize.query(
      `INSERT INTO wtb_requests (buyer_id, category_id, title, description, budget_min, budget_max, status)
       VALUES (:buyer_id, :category_id, :title, :description, :budget_min, :budget_max, 'pending')`,
      {
        replacements: {
          buyer_id: buyerId,
          category_id,
          title,
          description,
          budget_min: budget_min || null,
          budget_max: budget_max || null
        },
        type: QueryTypes.INSERT
      }
    );

    const requestId = result[0];

    res.status(201).json({
      success: true,
      message: 'WTB request created successfully. It is now pending review.',
      data: {
        id: requestId,
        buyer_id: buyerId,
        category_id,
        title,
        description,
        budget_min,
        budget_max,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Create WTB request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create WTB request',
      error: error.message
    });
  }
};

// Get buyer's WTB requests
const getBuyerWtbRequests = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { status, category_id, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereClause = 'WHERE w.buyer_id = :buyer_id';
    const replacements = { buyer_id: buyerId };

    if (status) {
      whereClause += ' AND w.status = :status';
      replacements.status = status;
    }

    if (category_id) {
      whereClause += ' AND w.category_id = :category_id';
      replacements.category_id = category_id;
    }

    // Get WTB requests with pagination
    const requests = await sequelize.query(
      `SELECT w.id, w.title, w.description, w.budget_min, w.budget_max, 
              w.status, w.created_at, c.name as category_name
       FROM wtb_requests w
       JOIN categories c ON w.category_id = c.id
       ${whereClause}
       ORDER BY w.created_at DESC
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
      `SELECT COUNT(*) as total FROM wtb_requests w ${whereClause}`,
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
        requests,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: total,
          items_per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get buyer WTB requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get WTB requests',
      error: error.message
    });
  }
};

// Get WTB request details
const getWtbRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const buyerId = req.user.id;

    // Get WTB request details
    const requests = await sequelize.query(
      `SELECT w.*, c.name as category_name, u.username as buyer_username
       FROM wtb_requests w
       JOIN categories c ON w.category_id = c.id
       JOIN users u ON w.buyer_id = u.id
       WHERE w.id = :request_id AND w.buyer_id = :buyer_id`,
      {
        replacements: {
          request_id: requestId,
          buyer_id: buyerId
        },
        type: QueryTypes.SELECT
      }
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'WTB request not found'
      });
    }

    const request = requests[0];

    res.status(200).json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('Get WTB request details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get WTB request details',
      error: error.message
    });
  }
};

// Update WTB request
const updateWtbRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { title, description, budget_min, budget_max, status } = req.body;
    const buyerId = req.user.id;

    // Check if WTB request exists and belongs to buyer
    const requests = await sequelize.query(
      'SELECT id, status FROM wtb_requests WHERE id = :request_id AND buyer_id = :buyer_id',
      {
        replacements: {
          request_id: requestId,
          buyer_id: buyerId
        },
        type: QueryTypes.SELECT
      }
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'WTB request not found'
      });
    }

    const request = requests[0];

    // Build update query dynamically based on provided fields
    const updateFields = [];
    const replacements = {
      request_id: requestId
    };

    if (title !== undefined) {
      updateFields.push('title = :title');
      replacements.title = title;
    }
    if (description !== undefined) {
      updateFields.push('description = :description');
      replacements.description = description;
    }
    if (budget_min !== undefined) {
      updateFields.push('budget_min = :budget_min');
      replacements.budget_min = budget_min;
    }
    if (budget_max !== undefined) {
      updateFields.push('budget_max = :budget_max');
      replacements.budget_max = budget_max;
    }
    if (status !== undefined) {
      // Only allow buyer to change status to 'closed' from other statuses
      if (request.status !== 'closed' && status === 'closed') {
        updateFields.push('status = :status');
        replacements.status = status;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid status change'
        });
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Update WTB request
    await sequelize.query(
      `UPDATE wtb_requests SET ${updateFields.join(', ')} WHERE id = :request_id`,
      {
        replacements,
        type: QueryTypes.UPDATE
      }
    );

    res.status(200).json({
      success: true,
      message: 'WTB request updated successfully'
    });
  } catch (error) {
    console.error('Update WTB request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update WTB request',
      error: error.message
    });
  }
};

// Delete WTB request
const deleteWtbRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const buyerId = req.user.id;

    // Check if WTB request exists and belongs to buyer
    const requests = await sequelize.query(
      'SELECT id, status FROM wtb_requests WHERE id = :request_id AND buyer_id = :buyer_id',
      {
        replacements: {
          request_id: requestId,
          buyer_id: buyerId
        },
        type: QueryTypes.SELECT
      }
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'WTB request not found'
      });
    }

    const request = requests[0];

    // Only allow deletion if request is not yet closed
    if (request.status === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a closed WTB request'
      });
    }

    // Delete WTB request
    await sequelize.query(
      'DELETE FROM wtb_requests WHERE id = :request_id',
      {
        replacements: { request_id: requestId },
        type: QueryTypes.DELETE
      }
    );

    res.status(200).json({
      success: true,
      message: 'WTB request deleted successfully'
    });
  } catch (error) {
    console.error('Delete WTB request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete WTB request',
      error: error.message
    });
  }
};

// Get all WTB requests (for admin/merchant to view)
const getAllWtbRequests = async (req, res) => {
  try {
    const { status, category_id, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Build WHERE clause (excluding those marked as closed)
    let whereClause = 'WHERE w.status != \'closed\'';
    const replacements = {};

    if (status && status !== 'closed') {
      whereClause += ' AND w.status = :status';
      replacements.status = status;
    }

    if (category_id) {
      whereClause += ' AND w.category_id = :category_id';
      replacements.category_id = category_id;
    }

    // Get WTB requests with pagination
    const requests = await sequelize.query(
      `SELECT w.id, w.title, w.description, w.budget_min, w.budget_max, 
              w.status, w.created_at, c.name as category_name, u.username as buyer_username
       FROM wtb_requests w
       JOIN categories c ON w.category_id = c.id
       JOIN users u ON w.buyer_id = u.id
       ${whereClause}
       ORDER BY w.created_at DESC
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
      `SELECT COUNT(*) as total FROM wtb_requests w ${whereClause}`,
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
        requests,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: total,
          items_per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all WTB requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get WTB requests',
      error: error.message
    });
  }
};

// Get Pending WTB Requests for Admin
const getPendingWtbRequests = async (req, res) => {
  try {
    // Get WTB requests with pending status
    const requests = await sequelize.query(
      `SELECT w.id, w.title, w.description, w.budget_min, w.budget_max,
              w.status, w.created_at, c.name as category_name, u.username as buyer_username
       FROM wtb_requests w
       JOIN categories c ON w.category_id = c.id
       JOIN users u ON w.buyer_id = u.id
       WHERE w.status = 'pending'
       ORDER BY w.created_at DESC`,
      {
        type: QueryTypes.SELECT
      }
    );

    res.status(200).json({
      success: true,
      data: {
        requests: requests,
        count: requests.length
      }
    });
  } catch (error) {
    console.error('Get pending WTB requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending WTB requests',
      error: error.message
    });
  }
};

// Approve or Reject WTB Request (Admin)
const updateWtbRequestStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!['active', 'rejected', 'closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Valid statuses are: active, rejected, closed'
      });
    }

    // Check if WTB request exists
    const requests = await sequelize.query(
      'SELECT id FROM wtb_requests WHERE id = :request_id',
      {
        replacements: {
          request_id: requestId
        },
        type: QueryTypes.SELECT
      }
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'WTB request not found'
      });
    }

    // Update status
    await sequelize.query(
      'UPDATE wtb_requests SET status = :status WHERE id = :request_id',
      {
        replacements: {
          request_id: requestId,
          status: status
        },
        type: QueryTypes.UPDATE
      }
    );

    res.status(200).json({
      success: true,
      message: `WTB request status updated to ${status}`,
      data: {
        id: requestId,
        status: status
      }
    });
  } catch (error) {
    console.error('Update WTB request status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update WTB request status',
      error: error.message
    });
  }
};

module.exports = {
  createWtbRequest,
  getBuyerWtbRequests,
  getWtbRequest,
  updateWtbRequest,
  deleteWtbRequest,
  getAllWtbRequests,
  getPendingWtbRequests,
  updateWtbRequestStatus
};