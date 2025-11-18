const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = token ? new TelegramBot(token, { polling: false }) : null;

const sendOTP = async (chatId, otp) => {
  if (!bot) {
    console.log('Telegram bot not configured. Mock OTP sent to chatId:', chatId, 'OTP:', otp);
    return true;
  }

  try {
    const message = `🔐 Your Rekber OTP Code: ${otp}\n\nThis code will expire in 5 minutes. Please do not share this code with anyone.`;
    
    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Verify OTP', callback_data: `verify_otp_${otp}` }
        ]]
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error sending OTP via Telegram:', error);
    return false;
  }
};

const sendNotification = async (chatId, message, options = {}) => {
  if (!bot) {
    console.log('Telegram bot not configured. Mock notification sent to chatId:', chatId, 'Message:', message);
    return true;
  }

  try {
    const defaultOptions = {
      parse_mode: 'HTML',
      ...options
    };

    await bot.sendMessage(chatId, message, defaultOptions);
    return true;
  } catch (error) {
    console.error('Error sending notification via Telegram:', error);
    return false;
  }
};

const sendOrderAlert = async (chatId, transactionData) => {
  const { 
    transaction_id, 
    product_name, 
    quantity, 
    total_amount, 
    status,
    buyer_name,
    merchant_name 
  } = transactionData;

  let statusEmoji = '';
  let statusText = '';

  switch (status) {
    case 'UNPAID':
      statusEmoji = '⏳';
      statusText = 'Waiting for Payment';
      break;
    case 'PAID':
      statusEmoji = '💰';
      statusText = 'Payment Received';
      break;
    case 'COMPLETED':
      statusEmoji = '✅';
      statusText = 'Order Completed';
      break;
    case 'CANCELLED':
      statusEmoji = '❌';
      statusText = 'Order Cancelled';
      break;
    default:
      statusEmoji = '📦';
      statusText = status;
  }

  const message = `
${statusEmoji} <b>Order Update #${transaction_id}</b>

<b>Status:</b> ${statusText}
<b>Product:</b> ${product_name}
<b>Quantity:</b> ${quantity}
<b>Total Amount:</b> Rp ${Number(total_amount).toLocaleString('id-ID')}
<b>Buyer:</b> ${buyer_name}
<b>Merchant:</b> ${merchant_name}

Thank you for using Rekber! 🛡️
  `.trim();

  return await sendNotification(chatId, message);
};

const bindTelegramAccount = async (chatId, userId, userType) => {
  if (!bot) {
    console.log('Telegram bot not configured. Mock binding for chatId:', chatId, 'userId:', userId, 'userType:', userType);
    return true;
  }

  try {
    const message = `
🔗 <b>Telegram Account Binding</b>

Your Telegram account has been successfully linked to your ${userType} account!

<b>User ID:</b> ${userId}
<b>Chat ID:</b> ${chatId}

You will now receive important notifications about your transactions through this Telegram account.

To unlink, use the /unlink command in any chat.
    `.trim();

    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    return true;
  } catch (error) {
    console.error('Error sending binding confirmation:', error);
    return false;
  }
};

module.exports = {
  sendOTP,
  sendNotification,
  sendOrderAlert,
  bindTelegramAccount
};