const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

const verifyMerchant = async (req, res) => {
  const { merchant_id, username } = req.body;

  try {
    let merchantRow;

    if (username) {
      const merchants = await sequelize.query(
        'SELECT id, user_id FROM merchants WHERE username = :username',
        {
          replacements: { username },
          type: QueryTypes.SELECT
        }
      );
      if (merchants.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Merchant not found'
        });
      }
      merchantRow = merchants[0];
    } else if (merchant_id) {
      const merchants = await sequelize.query(
        'SELECT id, user_id FROM merchants WHERE id = :merchant_id',
        {
          replacements: { merchant_id },
          type: QueryTypes.SELECT
        }
      );
      if (merchants.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Merchant not found'
        });
      }
      merchantRow = merchants[0];
    } else {
      return res.status(400).json({
        success: false,
        message: 'merchant_id or username is required'
      });
    }

    const users = await sequelize.query(
      "SELECT id, role, is_active FROM users WHERE id = :user_id AND role = 'merchant'",
      {
        replacements: { user_id: merchantRow.user_id },
        type: QueryTypes.SELECT
      }
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = users[0];

    if (user.is_active === 1 || user.is_active === true) {
      return res.status(200).json({
        success: true,
        message: 'Merchant already active'
      });
    }

    await sequelize.query(
      "UPDATE users SET is_active = 1 WHERE id = :user_id AND role = 'merchant'",
      {
        replacements: { user_id: user.id },
        type: QueryTypes.UPDATE
      }
    );

    res.json({
      success: true,
      message: 'Merchant verified successfully'
    });
  } catch (error) {
    console.error('Error verifying merchant:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const approveProduct = async (req, res) => {
  const { product_id } = req.body;

  try {
    const result = await sequelize.query(
      "UPDATE products SET status = 'active' WHERE id = :product_id",
      {
        replacements: { product_id },
        type: QueryTypes.UPDATE
      }
    );

    // result[0] is affectedRows for UPDATE queries
    if (!result || result[0] === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product approved successfully'
    });
  } catch (error) {
    console.error('Error approving product:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const approveWithdrawal = async (req, res) => {
  const { withdrawal_id } = req.body;

  try {
    const [withdrawal] = await sequelize.query(
      "SELECT w.*, m.bank_name, m.bank_acc_no FROM withdrawals w JOIN merchants m ON w.merchant_id = m.id WHERE w.id = :withdrawal_id AND w.status = 'PENDING'",
      {
        replacements: { withdrawal_id },
        type: QueryTypes.SELECT
      }
    );

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found or already processed'
      });
    }

    const [bankSettings] = await sequelize.query(
      "SELECT setting_value as bank_list FROM settings WHERE setting_key = 'admin_bank_list'",
      {
        type: QueryTypes.SELECT
      }
    );

    let finalAmount = withdrawal.amount;
    let feeDeducted = 0;

    if (bankSettings && bankSettings.bank_list) {
      const bankList = JSON.parse(bankSettings.bank_list);
      const isSameBank = bankList.includes(withdrawal.bank_name);

      if (!isSameBank) {
        finalAmount -= 2500;
        feeDeducted = 2500;
      }
    }

    await sequelize.query(
      "UPDATE withdrawals SET status = 'APPROVED', fee_deducted = :feeDeducted WHERE id = :withdrawal_id",
      {
        replacements: {
          withdrawal_id,
          feeDeducted
        },
        type: QueryTypes.UPDATE
      }
    );

    res.json({
      success: true,
      message: 'Withdrawal approved successfully',
      data: {
        original_amount: withdrawal.amount,
        final_amount: finalAmount,
        fee_deducted: feeDeducted
      }
    });
  } catch (error) {
    console.error('Error approving withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const listWithdrawals = async (req, res) => {
  try {
    const rows = await sequelize.query(
      "SELECT w.id, w.amount, w.status, w.fee_deducted, m.shop_name AS merchant, w.created_at FROM withdrawals w JOIN merchants m ON w.merchant_id = m.id ORDER BY w.created_at DESC",
      { type: QueryTypes.SELECT }
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error listing withdrawals:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Resolve Dispute
const resolveDispute = async (req, res) => {
  try {
    const { transactionId, decision, admin_note } = req.body;
    const adminId = req.user.id;

    // Validate input
    if (!transactionId || !decision) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID and decision are required'
      });
    }

    if (!['refund', 'release'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'Decision must be either "refund" or "release"'
      });
    }

    // Start transaction
    const t = await sequelize.transaction();

    try {
      // Get current transaction details
      const transactions = await sequelize.query(
        `SELECT t.id, t.invoice_number, t.status, t.buyer_id, t.merchant_id,
                t.total_amount, t.amount_net
         FROM transactions t
         WHERE t.invoice_number = :transaction_id`,
        {
          replacements: { transaction_id: transactionId },
          type: QueryTypes.SELECT,
          transaction: t
        }
      );

      if (transactions.length === 0) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      const transaction = transactions[0];

      // Check if transaction is in dispute status
      if (transaction.status !== 'DISPUTE') {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Transaction is not in dispute status'
        });
      }

      if (decision === 'refund') {
        // IF Refund:
        // 1. Set transactions.status = 'CANCELLED'
        await sequelize.query(
          `UPDATE transactions
           SET status = 'CANCELLED', updated_at = NOW()
           WHERE id = :transaction_id`,
          {
            replacements: { transaction_id: transaction.id },
            type: QueryTypes.UPDATE,
            transaction: t
          }
        );

        // 2. Add transactions.total_amount to users.user_credit (Buyer's ID)
        await sequelize.query(
          `UPDATE users
           SET user_credit = user_credit + :amount
           WHERE id = :user_id`,
          {
            replacements: {
              amount: transaction.total_amount,
              user_id: transaction.buyer_id
            },
            type: QueryTypes.UPDATE,
            transaction: t
          }
        );
      } else if (decision === 'release') {
        // IF Release:
        // 1. Set transactions.status = 'COMPLETED'
        await sequelize.query(
          `UPDATE transactions
           SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW()
           WHERE id = :transaction_id`,
          {
            replacements: { transaction_id: transaction.id },
            type: QueryTypes.UPDATE,
            transaction: t
          }
        );

        // 2. Add transactions.amount_net to merchants.balance
        await sequelize.query(
          `UPDATE merchants
           SET balance = balance + :earnings
           WHERE id = :merchant_id`,
          {
            replacements: {
              earnings: transaction.amount_net,
              merchant_id: transaction.merchant_id
            },
            type: QueryTypes.UPDATE,
            transaction: t
          }
        );
      }

      // Insert System Message to Chat: "Sengketa selesai. [Dana dikembalikan ke Pembeli/...]"
      const message = decision === 'refund'
        ? 'Sengketa selesai. Dana dikembalikan ke Pembeli.'
        : 'Sengketa selesai. Dana diteruskan ke Penjual.';

      await sequelize.query(
        `INSERT INTO chat_messages
         (room_id, room_type, sender_id, message, message_type, created_at)
         VALUES (:room_id, :room_type, NULL, :message, :message_type, NOW())`,
        {
          replacements: {
            room_id: transactionId,
            room_type: 'arbitrase',
            message: message,
            message_type: 'system'
          },
          type: QueryTypes.INSERT,
          transaction: t
        }
      );

      // Add admin note to transaction if provided
      if (admin_note) {
        await sequelize.query(
          `INSERT INTO transaction_logs
           (transaction_id, user_id, action, old_status, new_status, description)
           VALUES (:transaction_id, :user_id, 'dispute_resolved', 'DISPUTE', :new_status, :admin_note)`,
          {
            replacements: {
              transaction_id: transaction.id,
              user_id: adminId,
              new_status: decision === 'refund' ? 'CANCELLED' : 'COMPLETED',
              admin_note: admin_note
            },
            type: QueryTypes.INSERT,
            transaction: t
          }
        );
      }

      // Commit transaction
      await t.commit();

      // Send notifications to involved parties
      const { sendNotification } = require('../utils/telegramBot');

      // Get user details for notification
      const users = await sequelize.query(
        `SELECT u.telegram_chat_id, u.username, u.role, t.invoice_number, t.total_amount
         FROM users u
         JOIN transactions t ON (u.id = t.buyer_id OR u.id = (
           SELECT m.user_id FROM merchants m WHERE m.id = t.merchant_id
         ))
         WHERE t.invoice_number = :transaction_id AND u.telegram_chat_id IS NOT NULL`,
        {
          replacements: { transaction_id: transactionId },
          type: QueryTypes.SELECT
        }
      );

      for (const user of users) {
        const message = `
✅ <b>Dispute Resolution</b>

The dispute for transaction has been resolved:
<b>Invoice:</b> ${transaction.invoice_number}
<b>Decision:</b> ${decision === 'refund' ? 'Refund to Buyer' : 'Release to Merchant'}
<b>Amount:</b> Rp ${Number(transaction.total_amount).toLocaleString('id-ID')}
<b>New Status:</b> ${decision === 'refund' ? 'CANCELLED' : 'COMPLETED'}

Thank you for using Rekber! 🛡️
        `.trim();

        await sendNotification(user.telegram_chat_id, message);
      }

      res.status(200).json({
        success: true,
        message: 'Dispute resolved successfully',
        data: {
          transaction_id: transactionId,
          decision: decision,
          status: decision === 'refund' ? 'CANCELLED' : 'COMPLETED',
          admin_note: admin_note
        }
      });
    } catch (error) {
      // Rollback transaction on error
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Resolve dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve dispute',
      error: error.message
    });
  }
};

// Get Arbitration List
const getArbitrationList = async (req, res) => {
  try {
    // Fetch transactions where status is 'DISPUTE'
    // Include: Join with chat_messages table to get the room_id so the Admin can open the chat UI immediately
    const transactions = await sequelize.query(
      `SELECT t.id, t.invoice_number, t.status, t.buyer_id, t.merchant_id,
              t.quantity, t.price_per_item, t.total_amount, t.created_at,
              b.username as buyer_username, m.shop_name as merchant_shop_name,
              cm.room_id as chat_id
       FROM transactions t
       LEFT JOIN users b ON t.buyer_id = b.id
       LEFT JOIN merchants m ON t.merchant_id = m.id
       LEFT JOIN chat_messages cm ON cm.room_id = t.invoice_number AND cm.room_type = 'arbitrase'
       WHERE t.status = 'DISPUTE'
       GROUP BY t.id, cm.room_id
       ORDER BY t.created_at DESC`,
      { type: QueryTypes.SELECT }
    );

    res.status(200).json({
      success: true,
      data: {
        disputes: transactions,
        count: transactions.length
      }
    });
  } catch (error) {
    console.error('Get arbitration list error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get arbitration list',
      error: error.message
    });
  }
};

// Get Pending Merchants List
const getPendingMerchants = async (req, res) => {
  try {
    // Fetch merchants with status that needs admin verification
    // Join with users table to get user details
    const merchants = await sequelize.query(
      `SELECT m.id, m.user_id, m.shop_name, m.username, m.full_name_ktp, m.email, m.phone,
              m.ktp_image_url, m.ijazah_image_url, m.bank_name, m.account_number,
              m.created_at as merchant_created_at,
              u.is_active as user_is_active, u.email as user_email, u.username as user_username
       FROM merchants m
       JOIN users u ON m.user_id = u.id
       WHERE u.is_active = 0  -- Pending verification
       ORDER BY m.created_at DESC`,
      { type: QueryTypes.SELECT }
    );

    res.status(200).json({
      success: true,
      data: {
        merchants: merchants,
        count: merchants.length
      }
    });
  } catch (error) {
    console.error('Get pending merchants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending merchants',
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

// Get Single Arbitration by Invoice Number
const getSingleArbitration = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    // Fetch transaction details based on invoice number
    const transactions = await sequelize.query(
      `SELECT t.id, t.invoice_number, t.status, t.buyer_id, t.merchant_id,
              t.quantity, t.price_per_item, t.total_amount, t.created_at,
              t.shipping_address, t.shipping_city, t.shipping_postal_code,
              t.shipping_service, t.amount_net, t.completed_at,
              b.username as buyer_username, m.shop_name as merchant_shop_name,
              m.full_name_ktp as merchant_name
       FROM transactions t
       LEFT JOIN users b ON t.buyer_id = b.id
       LEFT JOIN merchants m ON t.merchant_id = m.id
       WHERE t.invoice_number = :invoiceNumber
       ORDER BY t.created_at DESC`,
      {
        replacements: { invoiceNumber },
        type: QueryTypes.SELECT
      }
    );

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Arbitration transaction not found'
      });
    }

    const transaction = transactions[0];

    // Get related chat messages for this arbitration/dispute
    const chatMessages = await sequelize.query(
      `SELECT cm.id, cm.sender_id, cm.message, cm.message_type, cm.created_at,
              u.username as sender_username, u.role as sender_role
       FROM chat_messages cm
       LEFT JOIN users u ON cm.sender_id = u.id
       WHERE cm.room_id = :invoiceNumber AND cm.room_type = 'arbitrase'
       ORDER BY cm.created_at ASC`,
      {
        replacements: { invoiceNumber },
        type: QueryTypes.SELECT
      }
    );

    // Get related products if available
    const products = await sequelize.query(
      `SELECT p.id, p.name, p.description, p.thumbnail_url, p.price
       FROM products p
       WHERE p.id IN (
         SELECT DISTINCT product_id FROM transaction_items WHERE transaction_id = :transactionId
       )`,
      {
        replacements: { transactionId: transaction.id },
        type: QueryTypes.SELECT
      }
    );

    res.status(200).json({
      success: true,
      data: {
        transaction: transaction,
        chat_messages: chatMessages,
        products: products
      }
    });
  } catch (error) {
    console.error('Get single arbitration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get arbitration details',
      error: error.message
    });
  }
};

// Update Arbitration (placeholder - may be used for adding notes or comments)
const updateArbitration = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { notes, status } = req.body; // Possible fields to update

    // For now, this endpoint might be used to add admin notes or update status
    // We can add admin notes to a transaction_logs table
    if (notes) {
      await sequelize.query(
        `INSERT INTO transaction_logs
         (transaction_id, user_id, action, old_status, new_status, description, created_at)
         VALUES (:transaction_id, :user_id, 'admin_comment', NULL, NULL, :notes, NOW())`,
        {
          replacements: {
            transaction_id: invoiceNumber, // This might need to be the actual transaction ID
            user_id: req.user.id,
            notes: notes
          },
          type: QueryTypes.INSERT
        }
      );
    }

    // Check if status update is requested and if it's DISPUTE (can't resolve here)
    if (status) {
      // If trying to update status, we should use resolveDispute instead
      // Return a message to indicate this
      return res.status(400).json({
        success: false,
        message: 'To resolve dispute, use the resolve endpoint instead of status update',
        hint: 'Use POST /api/admin/arbitration/resolve with decision field'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Arbitration updated successfully',
      data: {
        invoiceNumber,
        notes: notes || null
      }
    });
  } catch (error) {
    console.error('Update arbitration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update arbitration',
      error: error.message
    });
  }
};

// Get Single Withdrawal by ID
const getSingleWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch withdrawal details based on ID
    const withdrawals = await sequelize.query(
      `SELECT w.id, w.merchant_id, w.amount, w.status, w.fee_deducted, w.created_at, w.updated_at,
              m.shop_name AS merchant_name, m.bank_name, m.account_number, m.bank_acc_no
       FROM withdrawals w
       JOIN merchants m ON w.merchant_id = m.id
       WHERE w.id = :id`,
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );

    if (withdrawals.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    res.status(200).json({
      success: true,
      data: withdrawals[0]
    });
  } catch (error) {
    console.error('Get single withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get withdrawal details',
      error: error.message
    });
  }
};

module.exports = {
  verifyMerchant,
  approveProduct,
  approveWithdrawal,
  listWithdrawals,
  resolveDispute,
  getArbitrationList,
  getPendingMerchants,
  getAllProducts,
  getSingleArbitration,
  updateArbitration,
  getSingleWithdrawal
};