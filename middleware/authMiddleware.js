const jwt = require('jsonwebtoken');
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

// Verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const users = await sequelize.query(
      'SELECT id, email, username, role, is_active FROM users WHERE id = :userId',
      {
        replacements: { userId: decoded.id },
        type: QueryTypes.SELECT
      }
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found'
      });
    }
    
    const user = users[0];
    
    // Check if user is active
    if (!user.is_active && user.role !== 'buyer') {
      return res.status(401).json({
        success: false,
        message: 'Account is not active'
      });
    }
    
    // If user is a merchant, get merchant_id
    if (user.role === 'merchant') {
      const merchants = await sequelize.query(
        'SELECT id FROM merchants WHERE user_id = :userId',
        {
          replacements: { userId: decoded.id },
          type: QueryTypes.SELECT
        }
      );
      
      if (merchants.length > 0) {
        user.merchant_id = merchants[0].id;
      }
    }
    
    // Add user info to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  }
};

// Role-based access control
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - insufficient permissions'
      });
    }
    
    next();
  };
};

// Admin only access
const adminOnly = requireRole(['admin']);

// Merchant only access
const merchantOnly = requireRole(['merchant']);

// Buyer only access
const buyerOnly = requireRole(['buyer']);

// Admin or Merchant access
const adminOrMerchant = requireRole(['admin', 'merchant']);

// Admin or Buyer access
const adminOrBuyer = requireRole(['admin', 'buyer']);

// Merchant or Buyer access
const merchantOrBuyer = requireRole(['merchant', 'buyer']);

// All authenticated users access
const allAuthenticated = requireRole(['admin', 'merchant', 'buyer']);

module.exports = {
  verifyToken,
  requireRole,
  adminOnly,
  merchantOnly,
  buyerOnly,
  adminOrMerchant,
  adminOrBuyer,
  merchantOrBuyer,
  allAuthenticated
};