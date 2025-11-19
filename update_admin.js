const bcrypt = require('bcrypt');
const { sequelize } = require('./config/database');

async function updateAdmin() {
  try {
    const username = 'admin';
    const password = 'admin';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Update admin user password
    await sequelize.query(
      `UPDATE users 
       SET password_hash = :password_hash, role = 'admin', is_active = true
       WHERE username = :username`,
      {
        replacements: {
          username,
          password_hash: hashedPassword
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    console.log('Admin user updated successfully');
    console.log('Username: admin');
    console.log('Password: admin');
  } catch (error) {
    console.error('Error updating admin user:', error);
  } finally {
    await sequelize.close();
  }
}

updateAdmin();