const bcrypt = require('bcrypt');
const { sequelize } = require('./config/database');

async function createAdmin() {
  try {
    const username = 'admin';
    const password = 'admin';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert admin user
    await sequelize.query(
      `INSERT INTO users (username, password_hash, role, is_active) 
       VALUES (:username, :password_hash, :role, :is_active)`,
      {
        replacements: {
          username,
          password_hash: hashedPassword,
          role: 'admin',
          is_active: true
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    console.log('Admin user created successfully');
    console.log('Username: admin');
    console.log('Password: admin');
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await sequelize.close();
  }
}

createAdmin();