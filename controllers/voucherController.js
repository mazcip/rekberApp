const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

// Redeem Voucher
const redeemVoucher = async (req, res) => {
    const { voucher_code } = req.body;
    const userId = req.user.id; // Assuming authMiddleware populates req.user

    if (!voucher_code) {
        return res.status(400).json({
            success: false,
            message: 'Voucher code is required'
        });
    }

    const t = await sequelize.transaction();

    try {
        // Check 1: Eksistensi Kode
        const vouchers = await sequelize.query(
            'SELECT * FROM vouchers WHERE code = :code',
            {
                replacements: { code: voucher_code },
                type: QueryTypes.SELECT,
                transaction: t
            }
        );

        if (vouchers.length === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: 'Voucher tidak ditemukan'
            });
        }

        const voucher = vouchers[0];

        // Check 2: Status & Kadaluarsa
        const now = new Date();
        if (!voucher.is_active) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Voucher tidak aktif'
            });
        }

        if (voucher.expires_at && new Date(voucher.expires_at) < now) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Voucher sudah kadaluarsa'
            });
        }

        // Check 3: Penggunaan Unik
        const usages = await sequelize.query(
            'SELECT id FROM voucher_usages WHERE voucher_id = :voucher_id AND user_id = :user_id',
            {
                replacements: {
                    voucher_id: voucher.id,
                    user_id: userId
                },
                type: QueryTypes.SELECT,
                transaction: t
            }
        );

        if (usages.length > 0) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Voucher sudah pernah digunakan'
            });
        }

        // Check 4: Redeem & Log (Database Transaction)

        // a. Tambahkan nilai voucher ke kolom users.user_credit
        await sequelize.query(
            'UPDATE users SET user_credit = user_credit + :value WHERE id = :user_id',
            {
                replacements: {
                    value: voucher.value,
                    user_id: userId
                },
                type: QueryTypes.UPDATE,
                transaction: t
            }
        );

        // b. Catat penggunaan ke tabel voucher_usages
        await sequelize.query(
            'INSERT INTO voucher_usages (voucher_id, user_id, redeemed_at) VALUES (:voucher_id, :user_id, NOW())',
            {
                replacements: {
                    voucher_id: voucher.id,
                    user_id: userId
                },
                type: QueryTypes.INSERT,
                transaction: t
            }
        );

        // c. Commit Transaksi
        await t.commit();

        // Notifikasi Sukses
        res.status(200).json({
            success: true,
            message: `Selamat, Saldo Anda bertambah Rp ${parseFloat(voucher.value).toLocaleString('id-ID')}!`,
            data: {
                voucher_code: voucher.code,
                value: voucher.value,
                new_balance: 'Check your profile for updated balance' // Optional: fetch new balance if needed
            }
        });

    } catch (error) {
        await t.rollback();
        console.error('Error redeeming voucher:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

module.exports = {
    redeemVoucher
};
