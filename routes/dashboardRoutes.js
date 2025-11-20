const express = require('express');
const { verifyToken, adminOnly } = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

// Get dashboard statistics (Admin only)
router.get('/stats', 
  verifyToken,
  adminOnly,
  dashboardController.getStats
);

module.exports = router;