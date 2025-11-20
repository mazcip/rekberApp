const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const bcrypt = require('bcrypt');

const requestWithdrawal = async (req, res) => {
  const { amount } = req.body;

  try {
    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ success: false, message: 'Amount must be numeric' });
    }

    const amt = Number(amount);
    if (amt < 5000) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal 5000' });
    }

    const userId = req.user.id;
    const [merchant] = await sequelize.query(
      'SELECT id, balance FROM merchants WHERE user_id = :userId',
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    if (!merchant) {
      return res.status(404).json({ success: false, message: 'Merchant not found' });
    }

    if (Number(merchant.balance) < amt) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const [withdrawalId] = await sequelize.query(
      "INSERT INTO withdrawals (merchant_id, amount, status) VALUES (:merchant_id, :amount, 'PENDING')",
      { replacements: { merchant_id: merchant.id, amount: amt }, type: QueryTypes.INSERT }
    );

    await sequelize.query(
      'UPDATE merchants SET balance = balance - :amount WHERE id = :id',
      { replacements: { id: merchant.id, amount: amt }, type: QueryTypes.UPDATE }
    );

    res.json({ success: true, message: 'Withdrawal requested', data: { id: withdrawalId } });
  } catch (error) {
    console.error('Error requesting withdrawal:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get all merchants (admin only)
const getAllMerchants = async (req, res) => {
  try {
    const merchants = await sequelize.query(
      `SELECT u.id, u.username as name, u.email, u.created_at, u.updated_at,
              m.balance, m.store_name as shop_name, m.verification_status as status,
              m.is_verified, m.full_name_ktp, m.address, m.phone_number as phone,
              m.ktp_image_url, m.ijazah_image_url, m.tier_level as business_type
       FROM users u
       LEFT JOIN merchants m ON u.id = m.user_id
       WHERE u.role = 'merchant'
       ORDER BY u.created_at DESC`,
      { type: QueryTypes.SELECT }
    );

    // Format the merchants data to match frontend expectations
    const formattedMerchants = merchants.map(merchant => ({
      id: merchant.id,
      name: merchant.name,
      shop_name: merchant.shop_name || merchant.name,
      email: merchant.email,
      status: merchant.status || 'pending',
      balance: merchant.balance || 0,
      phone: merchant.phone,
      created_at: merchant.created_at,
      updated_at: merchant.updated_at,
      is_verified: merchant.is_verified,
      ktp_image: merchant.ktp_image_url,
      ijazah_image: merchant.ijazah_image_url,
      business_type: merchant.business_type
    }));

    res.json(formattedMerchants);
  } catch (error) {
    console.error('Error getting merchants:', error);
    res.status(500).json({ error: 'Failed to fetch merchants', message: error.message });
  }
};

// Get merchant by ID (admin only)
const getMerchantById = async (req, res) => {
  try {
    const { id } = req.params;

    const [merchant] = await sequelize.query(
      `SELECT u.id, u.username as name, u.email, u.created_at, u.updated_at,
              m.balance, m.store_name as shop_name, m.verification_status as status,
              m.is_verified, m.full_name_ktp, m.address, m.phone_number as phone,
              m.ktp_image_url, m.ijazah_image_url, m.tier_level as business_type
       FROM users u
       LEFT JOIN merchants m ON u.id = m.user_id
       WHERE u.role = 'merchant' AND u.id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Format the merchant data to match frontend expectations
    const formattedMerchant = {
      id: merchant.id,
      name: merchant.name,
      shop_name: merchant.shop_name || merchant.name,
      email: merchant.email,
      status: merchant.status || 'pending',
      balance: merchant.balance || 0,
      phone: merchant.phone,
      created_at: merchant.created_at,
      updated_at: merchant.updated_at,
      is_verified: merchant.is_verified,
      ktp_image: merchant.ktp_image_url,
      ijazah_image: merchant.ijazah_image_url,
      business_type: merchant.business_type
    };

    res.json(formattedMerchant);
  } catch (error) {
    console.error('Error getting merchant:', error);
    res.status(500).json({ error: 'Failed to fetch merchant', message: error.message });
  }
};

// Create merchant (admin only)
const createMerchant = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if merchant already exists
    const [existingUser] = await sequelize.query(
      'SELECT id FROM users WHERE email = :email',
      { replacements: { email }, type: QueryTypes.SELECT }
    );

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const [userId] = await sequelize.query(
      `INSERT INTO users (username, email, password, role, created_at, updated_at)
       VALUES (:name, :email, :password, 'merchant', NOW(), NOW())`,
      { replacements: { name, email, password: hashedPassword }, type: QueryTypes.INSERT }
    );

    // Create merchant profile
    await sequelize.query(
      `INSERT INTO merchants (user_id, store_name, verification_status, is_verified, created_at, updated_at)
       VALUES (:userId, :storeName, 'pending', 0, NOW(), NOW())`,
      { replacements: { userId, storeName: name }, type: QueryTypes.INSERT }
    );

    const createdMerchant = await getMerchantById({ params: { id: userId } }, { json: () => {} });

    res.status(201).json({
      message: 'Merchant created successfully',
      data: createdMerchant
    });
  } catch (error) {
    console.error('Error creating merchant:', error);
    res.status(500).json({ error: 'Failed to create merchant', message: error.message });
  }
};

// Update merchant (admin only)
const updateMerchant = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;

    // Update user
    const updates = [];
    const replacements = { id };

    if (name) {
      updates.push('username = :name');
      replacements.name = name;
    }
    if (email) {
      updates.push('email = :email');
      replacements.email = email;
    }

    if (updates.length > 0) {
      await sequelize.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = :id`,
        { replacements }
      );
    }

    const updatedMerchant = await getMerchantById(req, res);
    res.json({
      message: 'Merchant updated successfully',
      data: updatedMerchant
    });
  } catch (error) {
    console.error('Error updating merchant:', error);
    res.status(500).json({ error: 'Failed to update merchant', message: error.message });
  }
};

// Delete merchant (admin only)
const deleteMerchant = async (req, res) => {
  try {
    const { id } = req.params;

    // First check if merchant exists
    const [merchant] = await sequelize.query(
      'SELECT id FROM merchants WHERE user_id = :id',
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Delete related records first
    await sequelize.query(
      'DELETE FROM products WHERE user_id = :id',
      { replacements: { id }, type: QueryTypes.DELETE }
    );

    await sequelize.query(
      'DELETE FROM merchants WHERE user_id = :id',
      { replacements: { id }, type: QueryTypes.DELETE }
    );

    // Finally delete user
    await sequelize.query(
      'DELETE FROM users WHERE id = :id',
      { replacements: { id }, type: QueryTypes.DELETE }
    );

    res.json({ message: 'Merchant deleted successfully' });
  } catch (error) {
    console.error('Error deleting merchant:', error);
    res.status(500).json({ error: 'Failed to delete merchant', message: error.message });
  }
};

// Update merchant status (admin only) - approve/reject functionality
const updateMerchantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    if (!['approved', 'rejected', 'pending', 'active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    // Update merchant verification status
    const [result] = await sequelize.query(
      `UPDATE merchants SET verification_status = :status, updated_at = NOW() WHERE user_id = :id`,
      { replacements: { status, id }, type: QueryTypes.UPDATE }
    );

    if (result === 0) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // If status is approved, also update user as active
    if (status === 'approved') {
      await sequelize.query(
        `UPDATE users SET is_active = 1 WHERE id = :id`,
        { replacements: { id }, type: QueryTypes.UPDATE }
      );
    }

    const updatedMerchant = await getMerchantById({ params: { id } }, res);
    res.json({
      message: `Merchant ${status} successfully`,
      data: updatedMerchant
    });
  } catch (error) {
    console.error('Error updating merchant status:', error);
    res.status(500).json({ error: 'Failed to update merchant status', message: error.message });
  }
};

module.exports = {
  requestWithdrawal,
  getAllMerchants,
  getMerchantById,
  createMerchant,
  updateMerchant,
  deleteMerchant,
  updateMerchantStatus
};