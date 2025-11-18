const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

const verifyMerchant = async (req, res) => {
  const { merchant_id } = req.body;
  
  try {
    const [result] = await sequelize.query(
      'UPDATE merchants SET is_active = true WHERE id = :merchant_id',
      {
        replacements: { merchant_id },
        type: QueryTypes.UPDATE
      }
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Merchant not found' 
      });
    }

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
    const [result] = await sequelize.query(
      'UPDATE products SET status = "active" WHERE id = :product_id',
      {
        replacements: { product_id },
        type: QueryTypes.UPDATE
      }
    );

    if (result.affectedRows === 0) {
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
      'SELECT w.*, m.bank_name, m.bank_acc_no FROM withdrawals w JOIN merchants m ON w.merchant_id = m.id WHERE w.id = :withdrawal_id AND w.status = "PENDING"',
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
      'SELECT setting_value as bank_list FROM settings WHERE setting_key = "admin_bank_list"',
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
      'UPDATE withdrawals SET status = "APPROVED", fee_deducted = :feeDeducted WHERE id = :withdrawal_id',
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

module.exports = {
  verifyMerchant,
  approveProduct,
  approveWithdrawal
};