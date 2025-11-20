const db = require('../config/database');
const { QueryTypes } = require('sequelize');

const dashboardController = {
    // Get dashboard statistics
    async getStats(req, res) {
        try {
            // Get total merchants
            const totalMerchants = await db.sequelize.query(
                'SELECT COUNT(*) as count FROM users WHERE role = \'merchant\'',
                { type: QueryTypes.SELECT }
            );

            // Get total products
            const totalProducts = await db.sequelize.query(
                'SELECT COUNT(*) as count FROM products',
                { type: QueryTypes.SELECT }
            );

            // Get pending orders (transactions waiting for confirmation)
            const pendingOrders = await db.sequelize.query(
                'SELECT COUNT(*) as count FROM transactions WHERE status IN (\'pending\', \'waiting_seller\', \'waiting_buyer\')',
                { type: QueryTypes.SELECT }
            );

            // Get total revenue (completed transactions)
            const totalRevenue = await db.sequelize.query(
                `SELECT COALESCE(SUM(total_amount), 0) as total FROM transactions
                 WHERE status = 'completed'`,
                { type: QueryTypes.SELECT }
            );

            res.json({
                totalMerchants: parseInt(totalMerchants[0].count) || 0,
                totalProducts: parseInt(totalProducts[0].count) || 0,
                pendingOrders: parseInt(pendingOrders[0].count) || 0,
                totalRevenue: parseFloat(totalRevenue[0].total) || 0
            });
        } catch (error) {
            console.error('Error getting dashboard stats:', error);
            res.status(500).json({
                error: 'Failed to fetch dashboard statistics',
                message: error.message
            });
        }
    }
};

module.exports = dashboardController;