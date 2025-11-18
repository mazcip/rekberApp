const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const { getFileUrl } = require('../middleware/uploadMiddleware');
const { bindTelegramAccount } = require('../utils/telegramBot');

// Generate JWT token
const generateToken = (userId, role) => {
  return jwt.sign(
    { id: userId, role: role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Register Merchant
const registerMerchant = async (req, res) => {
  try {
    const {
      username,
      password,
      shop_name,
      full_name,
      address,
      phone_number,
      bank_name,
      bank_acc_no,
      bank_acc_name
    } = req.body;

    // Get uploaded files
    const files = req.files;
    const ktpImage = files && files.ktp_image ? files.ktp_image[0] : null;
    const ijazahImage = files && files.ijazah_image ? files.ijazah_image[0] : null;

    // Validate required fields
    if (!username || !password || !shop_name || !full_name || !address || 
        !phone_number || !bank_name || !bank_acc_no || !bank_acc_name) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate required files
    if (!ktpImage || !ijazahImage) {
      return res.status(400).json({
        success: false,
        message: 'KTP and Ijazah images are required'
      });
    }

    // Check if username already exists
    const existingUsers = await sequelize.query(
      'SELECT id FROM users WHERE username = :username',
      {
        replacements: { username },
        type: QueryTypes.SELECT
      }
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Check if merchant username already exists
    const existingMerchants = await sequelize.query(
      'SELECT id FROM merchants WHERE username = :username',
      {
        replacements: { username },
        type: QueryTypes.SELECT
      }
    );

    if (existingMerchants.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Shop username already exists'
      });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Start transaction
    const t = await sequelize.transaction();

    try {
      // Create user record
      const userResult = await sequelize.query(
        `INSERT INTO users (username, password_hash, role, is_active) 
         VALUES (:username, :password_hash, 'merchant', FALSE)`,
        {
          replacements: { 
            username, 
            password_hash: passwordHash 
          },
          type: QueryTypes.INSERT,
          transaction: t
        }
      );

      const userId = userResult[0];

      // Get file URLs
      const ktpImageUrl = getFileUrl(ktpImage.path);
      const ijazahImageUrl = getFileUrl(ijazahImage.path);

      // Create merchant record
      await sequelize.query(
        `INSERT INTO merchants 
         (user_id, username, shop_name, full_name, address, phone_number, 
          bank_name, bank_acc_no, bank_acc_name, ktp_image_url, ijazah_image_url) 
         VALUES (:user_id, :username, :shop_name, :full_name, :address, :phone_number, 
          :bank_name, :bank_acc_no, :bank_acc_name, :ktp_image_url, :ijazah_image_url)`,
        {
          replacements: { 
            user_id: userId,
            username,
            shop_name,
            full_name,
            address,
            phone_number,
            bank_name,
            bank_acc_no,
            bank_acc_name,
            ktp_image_url: ktpImageUrl,
            ijazah_image_url: ijazahImageUrl
          },
          type: QueryTypes.INSERT,
          transaction: t
        }
      );

      // Commit transaction
      await t.commit();

      res.status(201).json({
        success: true,
        message: 'Merchant registration successful. Your account is pending approval by admin.',
        data: {
          username,
          shop_name,
          status: 'pending'
        }
      });
    } catch (error) {
      // Rollback transaction on error
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

// Login Merchant
const loginMerchant = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Find user with merchant role
    const users = await sequelize.query(
      `SELECT u.id, u.username, u.password_hash, u.role, u.is_active, m.id as merchant_id
       FROM users u
       JOIN merchants m ON u.id = m.user_id
       WHERE u.username = :username AND u.role = 'merchant'`,
      {
        replacements: { username },
        type: QueryTypes.SELECT
      }
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    const user = users[0];

    // Check if account is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is not active. Please wait for admin approval.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Generate JWT token
    const token = generateToken(user.id, user.role);

    // Get merchant details
    const merchants = await sequelize.query(
      `SELECT id, username, shop_name, full_name, tier_level, balance
       FROM merchants WHERE user_id = :user_id`,
      {
        replacements: { user_id: user.id },
        type: QueryTypes.SELECT
      }
    );

    const merchant = merchants[0];

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        },
        merchant: merchant,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// Login Buyer (Mock Google Auth)
const loginBuyer = async (req, res) => {
  try {
    const { email, name } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if user exists
    let users = await sequelize.query(
      'SELECT id, email, role, is_active, buyer_tier FROM users WHERE email = :email',
      {
        replacements: { email },
        type: QueryTypes.SELECT
      }
    );

    let user;
    
    // If user doesn't exist, create new buyer
    if (users.length === 0) {
      // Create new buyer user
      const result = await sequelize.query(
        `INSERT INTO users (email, role, is_active, buyer_tier) 
         VALUES (:email, 'buyer', TRUE, 'bronze')`,
        {
          replacements: { email },
          type: QueryTypes.INSERT
        }
      );
      
      user = {
        id: result[0],
        email,
        role: 'buyer',
        is_active: true,
        buyer_tier: 'bronze'
      };
    } else {
      user = users[0];
      
      // Check if user is a buyer
      if (user.role !== 'buyer') {
        return res.status(401).json({
          success: false,
          message: 'This email is registered with a different account type'
        });
      }
    }

    // Generate JWT token
    const token = generateToken(user.id, user.role);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          buyer_tier: user.buyer_tier
        },
        token
      }
    });
  } catch (error) {
    console.error('Buyer login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let profileData;

    if (userRole === 'merchant') {
      // Get merchant profile
      const merchants = await sequelize.query(
        `SELECT u.id, u.username, u.role, u.email, u.telegram_chat_id,
                m.id as merchant_id, m.username as merchant_username, m.shop_name, 
                m.full_name, m.address, m.phone_number, m.ktp_image_url, 
                m.ijazah_image_url, m.balance, m.tier_level, m.bank_name, 
                m.bank_acc_no, m.bank_acc_name
         FROM users u
         JOIN merchants m ON u.id = m.user_id
         WHERE u.id = :user_id`,
        {
          replacements: { user_id: userId },
          type: QueryTypes.SELECT
        }
      );
      
      if (merchants.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Merchant profile not found'
        });
      }
      
      profileData = merchants[0];
    } else if (userRole === 'buyer') {
      // Get buyer profile
      const buyers = await sequelize.query(
        `SELECT id, email, role, telegram_chat_id, buyer_tier
         FROM users WHERE id = :user_id AND role = 'buyer'`,
        {
          replacements: { user_id: userId },
          type: QueryTypes.SELECT
        }
      );
      
      if (buyers.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Buyer profile not found'
        });
      }
      
      profileData = buyers[0];
    } else if (userRole === 'admin') {
      // Get admin profile
      const admins = await sequelize.query(
        `SELECT id, email, username, role
         FROM users WHERE id = :user_id AND role = 'admin'`,
        {
          replacements: { user_id: userId },
          type: QueryTypes.SELECT
        }
      );
      
      if (admins.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Admin profile not found'
        });
      }
      
      profileData = admins[0];
    }

    res.status(200).json({
      success: true,
      data: profileData
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
};

// Bind Telegram Account
const bindTelegram = async (req, res) => {
  try {
    const { chat_id } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!chat_id) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID is required'
      });
    }

    // Update user's telegram chat ID
    const [result] = await sequelize.query(
      'UPDATE users SET telegram_chat_id = :chat_id WHERE id = :user_id',
      {
        replacements: { chat_id, user_id: userId },
        type: QueryTypes.UPDATE
      }
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Send confirmation message via Telegram
    await bindTelegramAccount(chat_id, userId, userRole);

    res.json({
      success: true,
      message: 'Telegram account linked successfully'
    });
  } catch (error) {
    console.error('Telegram binding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to link Telegram account',
      error: error.message
    });
  }
};

// Send OTP via Telegram
const sendOTP = async (req, res) => {
  try {
    const { chat_id } = req.body;
    const userId = req.user.id;

    if (!chat_id) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID is required'
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in database (you might want to create a separate table for this)
    await sequelize.query(
      'UPDATE users SET otp_code = :otp, otp_expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE) WHERE id = :user_id',
      {
        replacements: { otp, user_id: userId },
        type: QueryTypes.UPDATE
      }
    );

    // Send OTP via Telegram
    const { sendOTP: sendOTPToTelegram } = require('../utils/telegramBot');
    const sent = await sendOTPToTelegram(chat_id, otp);

    if (!sent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP via Telegram'
      });
    }

    res.json({
      success: true,
      message: 'OTP sent successfully via Telegram'
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message
    });
  }
};

module.exports = {
  registerMerchant,
  loginMerchant,
  loginBuyer,
  getProfile,
  bindTelegram,
  sendOTP
};