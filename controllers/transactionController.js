const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const crypto = require('crypto');
const { sendOrderAlert } = require('../utils/telegramBot');

// Helper function to generate unique transaction ID
const generateTransactionId = () => {
  return 'TRX-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Helper function to calculate transaction fees
const calculateTransactionFees = (price, quantity, buyerTier) => {
  // Base values (in real app, these would come from settings table)
  const appFeePercentage = 0.02; // 2% app fee
  const gatewayFeePercentage = 0.015; // 1.5% payment gateway fee

  // Buyer tier discounts
  const tierDiscounts = {
    'bronze': 0,
    'silver': 0.001, // 0.1% discount
    'gold': 0.002,   // 0.2% discount
    'platinum': 0.003 // 0.3% discount
  };

  const subtotal = price * quantity;
  const appFee = subtotal * appFeePercentage;
  const tierDiscount = subtotal * (tierDiscounts[buyerTier] || 0);
  const gatewayFee = subtotal * gatewayFeePercentage;

  return {
    subtotal,
    appFee,
    tierDiscount,
    gatewayFee,
    totalAmount: subtotal + appFee - tierDiscount + gatewayFee
  };
};

// Create Transaction
const createTransaction = async (req, res) => {
  try {
    const { product_id, quantity, payment_method } = req.body;
    const buyerId = req.user.id;

    // Validate input
    if (!product_id || !quantity || !payment_method) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, quantity, and payment method are required'
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be greater than 0'
      });
    }

    // Validate payment method
    const validPaymentMethods = ['duitku_qris', 'duitku_va', 'duitku_ewallet', 'duitku_retail'];
    if (!validPaymentMethods.includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method'
      });
    }

    // Start transaction
    const t = await sequelize.transaction();

    try {
      // Get product details and check stock
      const products = await sequelize.query(
        `SELECT p.id, p.name, p.price, p.stock, p.status, 
                p.merchant_id, m.user_id as merchant_user_id, u.username as merchant_username
         FROM products p
         JOIN merchants m ON p.merchant_id = m.id
         JOIN users u ON m.user_id = u.id
         WHERE p.id = :product_id AND p.status = 'active'`,
        {
          replacements: { product_id },
          type: QueryTypes.SELECT,
          transaction: t
        }
      );

      if (products.length === 0) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Product not found or not available'
        });
      }

      const product = products[0];

      // Check if buyer is trying to buy their own product
      if (product.merchant_user_id === buyerId) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'You cannot buy your own product'
        });
      }

      // Check stock availability
      if (product.stock < quantity) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock available'
        });
      }

      // Get buyer tier information
      const buyers = await sequelize.query(
        'SELECT buyer_tier FROM users WHERE id = :buyer_id',
        {
          replacements: { buyer_id: buyerId },
          type: QueryTypes.SELECT,
          transaction: t
        }
      );

      if (buyers.length === 0) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Buyer not found'
        });
      }

      const buyerTier = buyers[0].buyer_tier || 'bronze';

      // Calculate transaction fees
      const fees = calculateTransactionFees(product.price, quantity, buyerTier);

      // Generate unique transaction ID
      const transactionId = generateTransactionId();

      // Calculate expiry time (24 hours from now)
      const expiryTime = new Date();
      expiryTime.setHours(expiryTime.getHours() + 24);

      // Calculate amount_net (net amount for merchant after fees)
      const amountNet = fees.totalAmount - (fees.appFee + fees.gatewayFee - fees.tierDiscount);

      // Create transaction record
      const transactionResult = await sequelize.query(
        `INSERT INTO transactions
         (invoice_number, buyer_id, merchant_id, product_id, quantity,
          price_per_item, subtotal, app_fee, tier_discount, gateway_fee,
          total_amount, amount_net, payment_method, status, due_date)
         VALUES (:invoice_number, :buyer_id, :merchant_id, :product_id, :quantity,
          :price_per_item, :subtotal, :app_fee, :tier_discount, :gateway_fee,
          :total_amount, :amount_net, :payment_method, 'UNPAID', :due_date)`,
        {
          replacements: {
            invoice_number: transactionId,
            buyer_id: buyerId,
            merchant_id: product.merchant_id,
            product_id: product.id,
            quantity: quantity,
            price_per_item: product.price,
            subtotal: fees.subtotal,
            app_fee: fees.appFee,
            tier_discount: fees.tierDiscount,
            gateway_fee: fees.gatewayFee,
            total_amount: fees.totalAmount,
            amount_net: amountNet,
            payment_method: payment_method,
            due_date: expiryTime
          },
          type: QueryTypes.INSERT,
          transaction: t
        }
      );

      const newTransactionId = transactionResult[0];

      // No invoice record needed - invoice details are now in transactions table

      // Update product stock (decrement)
      await sequelize.query(
        'UPDATE products SET stock = stock - :quantity WHERE id = :product_id',
        {
          replacements: {
            quantity: quantity,
            product_id: product.id
          },
          type: QueryTypes.UPDATE,
          transaction: t
        }
      );

      // Commit transaction
      await t.commit();

      // In a real implementation, this would call the payment gateway API
      // For now, we'll return a mock payment URL
      const paymentUrl = `https://sandbox.duitku.com/web/merchant/payment/${transactionId}`;

      res.status(201).json({
        success: true,
        message: 'Transaction created successfully',
        data: {
          invoice_number: transactionId,
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: quantity
          },
          merchant: {
            id: product.merchant_id,
            username: product.merchant_username
          },
          payment: {
            method: payment_method,
            amount: fees.totalAmount,
            payment_url: paymentUrl,
            expires_at: expiryTime
          },
          fees: {
            subtotal: fees.subtotal,
            app_fee: fees.appFee,
            tier_discount: fees.tierDiscount,
            gateway_fee: fees.gatewayFee
          }
        }
      });
    } catch (error) {
      // Rollback transaction on error
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create transaction',
      error: error.message
    });
  }
};

// Payment Callback (Webhook)
const paymentCallback = async (req, res) => {
  try {
    const {
      merchantCode,
      amount,
      merchantOrderId,
      productDetail,
      additionalParam,
      paymentMethod,
      resultCode,
      merchantUserId,
      reference,
      signature,
      paymentCode
    } = req.body;

    // Get Duitku merchant code from environment variables
    const expectedMerchantCode = process.env.DUITKU_MERCHANT_CODE;

    // Verify signature - Duitku signature format: SHA256(merchantCode+merchantOrderId+amount+merchantSecretKey)
    const merchantSecretKey = process.env.DUITKU_MERCHANT_SECRET_KEY;
    if (!expectedMerchantCode || !merchantSecretKey) {
      console.error('Duitku configuration not available');
      return res.status(500).json({
        success: false,
        message: 'Payment gateway configuration error'
      });
    }

    // Verify merchant code
    if (merchantCode !== expectedMerchantCode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid merchant code'
      });
    }

    // Calculate expected signature
    const expectedSignature = crypto.createHash('sha256')
      .update(merchantCode + merchantOrderId + amount + merchantSecretKey)
      .digest('hex');

    // Verify signature
    if (signature.toLowerCase() !== expectedSignature.toLowerCase()) {
      console.error(`Signature mismatch. Expected: ${expectedSignature}, Got: ${signature}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid signature'
      });
    }

    // Find transaction by merchantOrderId (invoice_number)
    const transactions = await sequelize.query(
      `SELECT t.id, t.invoice_number, t.status, t.total_amount, t.buyer_id, t.merchant_id
       FROM transactions t
       WHERE t.invoice_number = :invoice_number`,
      {
        replacements: { invoice_number: merchantOrderId },
        type: QueryTypes.SELECT
      }
    );

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = transactions[0];

    // Check if amount matches
    if (parseFloat(amount) !== parseFloat(transaction.total_amount)) {
      return res.status(400).json({
        success: false,
        message: 'Amount mismatch'
      });
    }

    // Start transaction
    const t = await sequelize.transaction();

    try {
      let newStatus;

      // Determine new status based on resultCode
      if (resultCode === '00') { // Success
        newStatus = 'PAID';
      } else if (resultCode === '01') { // Failed
        newStatus = 'FAILED';
      } else if (resultCode === '02') { // Pending
        newStatus = 'PENDING';
      } else { // Expired or other
        newStatus = 'EXPIRED';
      }

      // Update transaction status
      await sequelize.query(
        `UPDATE transactions 
         SET status = :status, payment_method = :payment_method, duitku_ref = :reference, updated_at = NOW()
         WHERE id = :id`,
        {
          replacements: {
            status: newStatus,
            payment_method: paymentMethod,
            reference: reference,
            id: transaction.id
          },
          type: QueryTypes.UPDATE,
          transaction: t
        }
      );

      // If payment failed or expired, restore product stock
      if (newStatus === 'FAILED' || newStatus === 'EXPIRED') {
        await sequelize.query(
          `UPDATE products 
           SET stock = stock + (
             SELECT quantity FROM transactions WHERE id = :transaction_id
           )
           WHERE id = (
             SELECT product_id FROM transactions WHERE id = :transaction_id
           )`,
          {
            replacements: { transaction_id: transaction.id },
            type: QueryTypes.UPDATE,
            transaction: t
          }
        );
      }

      // Commit transaction
      await t.commit();

      // Get user details for notifications
      const merchantUser = await sequelize.query(
        'SELECT user_id FROM merchants WHERE id = :merchant_id',
        {
          replacements: { merchant_id: transaction.merchant_id },
          type: QueryTypes.SELECT
        }
      );

      const merchantUserId = merchantUser.length > 0 ? merchantUser[0].user_id : null;

      const userDetails = await sequelize.query(
        `SELECT u.telegram_chat_id, u.username, m.shop_name
         FROM users u
         LEFT JOIN merchants m ON u.id = m.user_id
         WHERE u.id = :buyer_id OR u.id = :merchant_user_id`,
        {
          replacements: {
            buyer_id: transaction.buyer_id,
            merchant_user_id: merchantUserId
          },
          type: QueryTypes.SELECT
        }
      );

      // Send Telegram notifications
      const transactionData = {
        invoice_number: transaction.invoice_number,
        product_name: (await sequelize.query(
          'SELECT name FROM products WHERE id = :product_id',
          {
            replacements: {
              product_id: (await sequelize.query(
                'SELECT product_id FROM transactions WHERE id = :transaction_id',
                { replacements: { transaction_id: transaction.id }, type: QueryTypes.SELECT }
              ))[0].product_id
            },
            type: QueryTypes.SELECT
          }
        ))[0].name,
        quantity: (await sequelize.query(
          'SELECT quantity FROM transactions WHERE id = :transaction_id',
          { replacements: { transaction_id: transaction.id }, type: QueryTypes.SELECT }
        ))[0].quantity,
        total_amount: transaction.total_amount,
        status: newStatus,
        buyer_name: userDetails.find(u => u.id === transaction.buyer_id)?.username || 'Unknown',
        merchant_name: userDetails.find(u => u.id === merchantUserId)?.shop_name || 'Unknown'
      };

      // Send notifications to buyer and merchant if they have Telegram linked
      userDetails.forEach(user => {
        if (user.telegram_chat_id) {
          sendOrderAlert(user.telegram_chat_id, transactionData);
        }
      });

      // Return success response to payment gateway
      res.status(200).json({
        success: true,
        message: 'Callback processed successfully'
      });

    } catch (error) {
      // Rollback transaction on error
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Payment callback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment callback',
      error: error.message
    });
  }
};

// Complete Order
const completeOrder = async (req, res) => {
  try {
    const { transaction_id: invoice_number } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate input
    if (!invoice_number) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }

    // Start transaction
    const t = await sequelize.transaction();

    try {
      // Get transaction details
      const transactions = await sequelize.query(
        `SELECT t.id, t.invoice_number, t.status, t.total_amount, t.buyer_id, 
                t.merchant_id, t.product_id, t.quantity, t.price_per_item,
                p.name as product_name, m.user_id as merchant_user_id
         FROM transactions t
         JOIN products p ON t.product_id = p.id
         JOIN merchants m ON t.merchant_id = m.id
         WHERE t.invoice_number = :invoice_number`,
        {
          replacements: { invoice_number },
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

      // Check if transaction is in PAID status
      if (transaction.status !== 'PAID') {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Only paid transactions can be completed'
        });
      }

      // Check authorization (only admin, the buyer, or the merchant can complete)
      if (userRole !== 'admin' &&
        userId !== transaction.buyer_id &&
        userId !== transaction.merchant_user_id) {
        await t.rollback();
        return res.status(403).json({
          success: false,
          message: 'Not authorized to complete this transaction'
        });
      }

      // Update transaction status to COMPLETED
      await sequelize.query(
        `UPDATE transactions 
         SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW()
         WHERE id = :id`,
        {
          replacements: { id: transaction.id },
          type: QueryTypes.UPDATE,
          transaction: t
        }
      );

      // No invoice table to update - invoice details are now in transactions table

      // Add funds to merchant balance using amount_net from transaction
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

      // Increment buyer's total successful transactions
      await sequelize.query(
        `UPDATE users 
         SET total_success_trx = total_success_trx + 1
         WHERE id = :buyer_id`,
        {
          replacements: { buyer_id: transaction.buyer_id },
          type: QueryTypes.UPDATE,
          transaction: t
        }
      );

      // Check and update buyer tier based on total successful transactions
      const buyerStats = await sequelize.query(
        'SELECT total_success_trx FROM users WHERE id = :buyer_id',
        {
          replacements: { buyer_id: transaction.buyer_id },
          type: QueryTypes.SELECT,
          transaction: t
        }
      );

      const totalTrx = buyerStats[0].total_success_trx;
      let newTier = 'bronze';

      if (totalTrx >= 100) {
        newTier = 'platinum';
      } else if (totalTrx >= 50) {
        newTier = 'gold';
      } else if (totalTrx >= 10) {
        newTier = 'silver';
      }

      // Update buyer tier if it has changed
      await sequelize.query(
        `UPDATE users 
         SET buyer_tier = :new_tier
         WHERE id = :buyer_id AND buyer_tier != :new_tier`,
        {
          replacements: {
            new_tier: newTier,
            buyer_id: transaction.buyer_id
          },
          type: QueryTypes.UPDATE,
          transaction: t
        }
      );

      // Check and update merchant tier based on total successful transactions
      const merchantStats = await sequelize.query(
        'SELECT tier_level FROM merchants WHERE id = :merchant_id',
        {
          replacements: { merchant_id: transaction.merchant_id },
          type: QueryTypes.SELECT,
          transaction: t
        }
      );

      const currentMerchantTier = merchantStats[0].tier_level;
      let newMerchantTier = currentMerchantTier;

      // Update merchant tier if it has changed
      await sequelize.query(
        `UPDATE merchants 
         SET tier_level = :new_tier
         WHERE id = :merchant_id AND tier_level != :new_tier`,
        {
          replacements: {
            new_tier: newMerchantTier,
            merchant_id: transaction.merchant_id
          },
          type: QueryTypes.UPDATE,
          transaction: t
        }
      );

      // Commit transaction
      await t.commit();

      // Get user details for notifications
      const merchantUser = await sequelize.query(
        'SELECT user_id FROM merchants WHERE id = :merchant_id',
        {
          replacements: { merchant_id: transaction.merchant_id },
          type: QueryTypes.SELECT
        }
      );

      const merchantUserId = merchantUser.length > 0 ? merchantUser[0].user_id : null;

      const userDetails = await sequelize.query(
        `SELECT u.telegram_chat_id, u.username, m.shop_name
         FROM users u
         LEFT JOIN merchants m ON u.id = m.user_id
         WHERE u.id = :buyer_id OR u.id = :merchant_user_id`,
        {
          replacements: {
            buyer_id: transaction.buyer_id,
            merchant_user_id: merchantUserId
          },
          type: QueryTypes.SELECT
        }
      );

      // Send Telegram notifications for order completion
      const transactionData = {
        invoice_number: transaction.invoice_number,
        product_name: transaction.product_name,
        quantity: transaction.quantity,
        total_amount: transaction.total_amount,
        status: 'COMPLETED',
        buyer_name: userDetails.find(u => u.id === transaction.buyer_id)?.username || 'Unknown',
        merchant_name: userDetails.find(u => u.id === merchantUserId)?.shop_name || 'Unknown'
      };

      // Send notifications to buyer and merchant if they have Telegram linked
      userDetails.forEach(user => {
        if (user.telegram_chat_id) {
          sendOrderAlert(user.telegram_chat_id, transactionData);
        }
      });

      res.status(200).json({
        success: true,
        message: 'Order completed successfully',
        data: {
          invoice_number: transaction.invoice_number,
          product_name: transaction.product_name,
          quantity: transaction.quantity,
          total_amount: transaction.total_amount,
          merchant_earnings: transaction.amount_net,
          buyer_tier: newTier,
          merchant_tier: newMerchantTier
        }
      });
    } catch (error) {
      // Rollback transaction on error
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Complete order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete order',
      error: error.message
    });
  }
};

// Get Transaction Details
const getTransactionDetails = async (req, res) => {
  try {
    const { transaction_id: invoice_number } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get transaction details
    const transactions = await sequelize.query(
      `SELECT t.id, t.invoice_number, t.status, t.quantity, t.price_per_item, 
              t.subtotal, t.app_fee, t.tier_discount, t.gateway_fee, t.total_amount,
              t.payment_method, t.created_at, t.updated_at, t.completed_at, t.due_date,
              p.name as product_name, p.description as product_description,
              m.shop_name, u.username as merchant_username,
              b.username as buyer_username, b.email as buyer_email
       FROM transactions t
       JOIN products p ON t.product_id = p.id
       JOIN merchants m ON t.merchant_id = m.id
       JOIN users u ON m.user_id = u.id
       JOIN users b ON t.buyer_id = b.id
       WHERE t.invoice_number = :invoice_number`,
      {
        replacements: { invoice_number },
        type: QueryTypes.SELECT
      }
    );

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = transactions[0];

    // Check authorization (only admin, the buyer, or the merchant can view)
    const merchantUser = await sequelize.query(
      'SELECT user_id FROM merchants WHERE id = :merchant_id',
      {
        replacements: { merchant_id: transaction.merchant_id },
        type: QueryTypes.SELECT
      }
    );

    const merchantUserId = merchantUser.length > 0 ? merchantUser[0].user_id : null;

    if (userRole !== 'admin' &&
      userId !== transaction.buyer_id &&
      userId !== merchantUserId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this transaction'
      });
    }

    // Get invoice details from transactions table
    const invoiceDetails = {
      invoice_number: transaction.invoice_number,
      amount: transaction.total_amount,
      status: transaction.status,
      due_date: transaction.due_date,
      created_at: transaction.created_at
    };

    res.status(200).json({
      success: true,
      data: {
        ...transaction,
        invoice: invoiceDetails
      }
    });
  } catch (error) {
    console.error('Get transaction details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transaction details',
      error: error.message
    });
  }
};

// Get User Transactions
const getUserTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause, replacements;

    if (userRole === 'merchant') {
      // Get merchant ID first
      const merchants = await sequelize.query(
        'SELECT id FROM merchants WHERE user_id = :user_id',
        {
          replacements: { user_id: userId },
          type: QueryTypes.SELECT
        }
      );

      if (merchants.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Merchant account not found'
        });
      }

      const merchantId = merchants[0].id;
      whereClause = 'WHERE t.merchant_id = :merchant_id';
      replacements = { merchant_id: merchantId };
    } else {
      // Buyer or admin
      whereClause = 'WHERE t.buyer_id = :user_id';
      replacements = { user_id: userId };
    }

    // Add status filter if provided
    if (status) {
      whereClause += ' AND t.status = :status';
      replacements.status = status;
    }

    // Get transactions with pagination
    const transactions = await sequelize.query(
      `SELECT t.id, t.invoice_number, t.status, t.total_amount, t.payment_method, t.created_at,
              p.name as product_name, p.thumbnail_url
       FROM transactions t
       JOIN products p ON t.product_id = p.id
       ${whereClause}
       ORDER BY t.created_at DESC
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

    // Get total count
    const totalCount = await sequelize.query(
      `SELECT COUNT(*) as total FROM transactions t ${whereClause}`,
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
        transactions,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: total,
          items_per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user transactions',
      error: error.message
    });
  }
};

// Request Dispute
const requestDispute = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason, evidence_image_url } = req.body;
    const buyerId = req.user.id;

    // Validate input
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Reason is required'
      });
    }

    // Start transaction
    const t = await sequelize.transaction();

    try {
      // Validate: Check if transaction exists and status is 'PAID' or 'SHIPPED'
      const transactions = await sequelize.query(
        `SELECT t.id, t.invoice_number, t.status, t.buyer_id, t.merchant_id, t.total_amount, t.amount_net,
                m.user_id as merchant_user_id
         FROM transactions t
         JOIN merchants m ON t.merchant_id = m.id
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

      // Check if buyer is authorized to dispute this transaction
      if (transaction.buyer_id !== buyerId) {
        await t.rollback();
        return res.status(403).json({
          success: false,
          message: 'Not authorized to dispute this transaction'
        });
      }

      // Check if transaction status allows dispute
      if (transaction.status !== 'PAID' && transaction.status !== 'SHIPPED') {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Cannot dispute transaction with status: ' + transaction.status
        });
      }

      // Update Status: Set transactions.status = 'DISPUTE'
      await sequelize.query(
        `UPDATE transactions
         SET status = 'DISPUTE', updated_at = NOW()
         WHERE id = :transaction_id`,
        {
          replacements: { transaction_id: transaction.id },
          type: QueryTypes.UPDATE,
          transaction: t
        }
      );

      // Create Chat Room: Check if a chat room for this transaction already exists
      let chatId;
      const existingChats = await sequelize.query(
        `SELECT id FROM chat_messages
         WHERE room_id = :transaction_id AND room_type = 'arbitrase'
         LIMIT 1`,
        {
          replacements: { transaction_id: transactionId },
          type: QueryTypes.SELECT,
          transaction: t
        }
      );

      if (existingChats.length > 0) {
        // Chat already exists, use the existing room_id
        chatId = transactionId;
      } else {
        // INSERT into chat_messages with arbitrase room_type
        // We'll use the transaction_id as the room_id
        chatId = transactionId;
      }

      // System Message: INSERT into chat_messages
      await sequelize.query(
        `INSERT INTO chat_messages
         (room_id, room_type, sender_id, message, message_type, created_at)
         VALUES (:room_id, :room_type, NULL, :message, :message_type, NOW())`,
        {
          replacements: {
            room_id: chatId,
            room_type: 'arbitrase',
            message: 'Sengketa dimulai. Admin, Penjual, dan Pembeli terhubung.',
            message_type: 'system'
          },
          type: QueryTypes.INSERT,
          transaction: t
        }
      );

      // Commit transaction
      await t.commit();

      // Get merchant and admin Telegram details for notifications
      const telegramUsers = await sequelize.query(
        `SELECT u.telegram_chat_id, u.username, u.role
         FROM users u
         WHERE u.id = :merchant_user_id OR u.role = 'admin'
         AND u.telegram_chat_id IS NOT NULL`,
        {
          replacements: { merchant_user_id: transaction.merchant_user_id },
          type: QueryTypes.SELECT
        }
      );

      // Send Telegram Alert to Merchant & Admin Group
      const { sendNotification } = require('../utils/telegramBot');

      for (const user of telegramUsers) {
        const message = `
⚠️ <b>Dispute Alert</b>

A dispute has been requested for transaction:
<b>Invoice:</b> ${transaction.invoice_number}
<b>Reason:</b> ${reason}
<b>Buyer:</b> ${transaction.buyer_id}
<b>Amount:</b> Rp ${Number(transaction.total_amount).toLocaleString('id-ID')}
<b>Current Status:</b> DISPUTE

Please review and take necessary action.
        `.trim();

        await sendNotification(user.telegram_chat_id, message);
      }

      // Now emit Socket.io event - we need to get the io instance
      // In a real implementation, you would access the io object passed to the socket handler
      // For now, let's just log it since we can't access the io instance directly from a controller
      console.log(`Emitting join_room event for transaction ${chatId} to notify socket users`);

      res.status(200).json({
        success: true,
        message: 'Dispute requested successfully',
        data: {
          transaction_id: transactionId,
          status: 'DISPUTE',
          chat_id: chatId
        }
      });
    } catch (error) {
      // Rollback transaction on error
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Request dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request dispute',
      error: error.message
    });
  }
};

module.exports = {
  createTransaction,
  paymentCallback,
  completeOrder,
  getTransactionDetails,
  getUserTransactions,
  requestDispute
};