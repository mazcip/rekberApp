const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

const socketHandler = (io) => {
  // Store active users and their socket IDs
  const activeUsers = new Map();
  
  // Store room participants
  const roomParticipants = new Map();

  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      // Verify JWT token (using the same verification logic as in authMiddleware)
      const jwt = require('jsonwebtoken');
      let decoded;

      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtError) {
        if (jwtError.name === 'JsonWebTokenError') {
          return next(new Error('Invalid token'));
        } else if (jwtError.name === 'TokenExpiredError') {
          return next(new Error('Token expired'));
        }
        throw jwtError;
      }

      // Get user details from database (same as authMiddleware)
      const users = await sequelize.query(
        'SELECT id, email, username, role, is_active FROM users WHERE id = :user_id',
        {
          replacements: { user_id: decoded.id },
          type: QueryTypes.SELECT
        }
      );

      if (users.length === 0) {
        return next(new Error('User not found'));
      }

      const user = users[0];

      // Check if user is active (same as authMiddleware)
      if (!user.is_active && user.role !== 'buyer') {
        return next(new Error('Account is not active'));
      }

      // If user is a merchant, get merchant_id (same as authMiddleware)
      if (user.role === 'merchant') {
        const merchants = await sequelize.query(
          'SELECT id FROM merchants WHERE user_id = :user_id',
          {
            replacements: { user_id: decoded.id },
            type: QueryTypes.SELECT
          }
        );

        if (merchants.length > 0) {
          user.merchant_id = merchants[0].id;
        }
      }

      socket.user = user;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      if (error.message === 'Invalid token' || error.message === 'Token expired' || error.message === 'Account is not active' || error.message === 'User not found') {
        next(new Error(error.message));
      } else {
        next(new Error('Authentication error'));
      }
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username} (${socket.user.role})`);
    
    // Store user socket mapping
    activeUsers.set(socket.user.id, socket.id);
    
    // Join user to their personal room for notifications
    socket.join(`user_${socket.user.id}`);
    
    // Handle joining private transaction chat
    socket.on('joinTransactionChat', async (data) => {
      try {
        const { transaction_id } = data;
        
        if (!transaction_id) {
          socket.emit('error', { message: 'Transaction ID is required' });
          return;
        }
        
        // Verify user is part of this transaction
        const transactions = await sequelize.query(
          `SELECT t.id, t.buyer_id, t.merchant_id, m.user_id as merchant_user_id
           FROM transactions t
           JOIN merchants m ON t.merchant_id = m.id
           WHERE t.transaction_id = :transaction_id`,
          {
            replacements: { transaction_id },
            type: QueryTypes.SELECT
          }
        );
        
        if (transactions.length === 0) {
          socket.emit('error', { message: 'Transaction not found' });
          return;
        }
        
        const transaction = transactions[0];
        
        // Check if user is authorized (buyer, merchant, or admin)
        if (socket.user.role !== 'admin' && 
            socket.user.id !== transaction.buyer_id && 
            socket.user.id !== transaction.merchant_user_id) {
          socket.emit('error', { message: 'Not authorized to join this chat' });
          return;
        }
        
        // Join transaction room
        const roomName = `transaction_${transaction_id}`;
        socket.join(roomName);
        
        // Track room participants
        if (!roomParticipants.has(roomName)) {
          roomParticipants.set(roomName, new Set());
        }
        roomParticipants.get(roomName).add(socket.user.id);
        
        // Notify others in the room
        socket.to(roomName).emit('userJoined', {
          user: {
            id: socket.user.id,
            username: socket.user.username,
            role: socket.user.role
          }
        });
        
        // Send chat history to the user
        const messages = await sequelize.query(
          `SELECT cm.id, cm.sender_id, cm.message, cm.message_type, cm.attachment_url, cm.created_at,
                  u.username, u.role
           FROM chat_messages cm
           JOIN users u ON cm.sender_id = u.id
           WHERE cm.room_id = :room_id AND cm.room_type = 'transaction'
           ORDER BY cm.created_at ASC
           LIMIT 50`,
          {
            replacements: { room_id: transaction_id },
            type: QueryTypes.SELECT
          }
        );
        
        socket.emit('chatHistory', {
          room_id: transaction_id,
          room_type: 'transaction',
          messages: messages
        });
        
        socket.emit('joinedRoom', { room_id: transaction_id, room_type: 'transaction' });
        
      } catch (error) {
        console.error('Join transaction chat error:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });
    
    // Handle joining arbitrase chat (group room)
    socket.on('joinArbitraseChat', async (data) => {
      try {
        const { transactionId, roomId } = data; // Accept both field names for compatibility
        const transaction_id = transactionId || roomId; // Use either field name

        if (!transaction_id) {
          socket.emit('error', { message: 'Transaction ID is required' });
          return;
        }

        // Verify transaction exists and is in a state that requires arbitrase
        // First, try to find transaction by transaction_id
        let query = `
          SELECT t.id, t.invoice_number, t.buyer_id, t.merchant_id, t.status, m.user_id as merchant_user_id
           FROM transactions t
           LEFT JOIN merchants m ON t.merchant_id = m.id
           WHERE t.invoice_number = :transaction_id
        `;

        // If not found with invoice_number, try transaction_id field
        let transactions = await sequelize.query(query, {
          replacements: { transaction_id },
          type: QueryTypes.SELECT
        });

        if (transactions.length === 0) {
          // Try with id field if invoice_number doesn't match
          query = `
            SELECT t.id, t.invoice_number, t.buyer_id, t.merchant_id, t.status, m.user_id as merchant_user_id
            FROM transactions t
            LEFT JOIN merchants m ON t.merchant_id = m.id
            WHERE t.id = :transaction_id
          `;

          transactions = await sequelize.query(query, {
            replacements: { transaction_id },
            type: QueryTypes.SELECT
          });
        }

        if (transactions.length === 0) {
          socket.emit('error', { message: 'Transaction not found' });
          return;
        }

        const transaction = transactions[0];

        // Check if user is authorized (admin only for arbitration rooms)
        if (socket.user.role !== 'admin') {
          socket.emit('error', { message: 'Only admins can join arbitration rooms' });
          return;
        }

        // Join arbitrase room - use the invoice_number as the room identifier
        const roomName = `arbitrase_${transaction.invoice_number}`;
        socket.join(roomName);

        // Track room participants
        if (!roomParticipants.has(roomName)) {
          roomParticipants.set(roomName, new Set());
        }
        roomParticipants.get(roomName).add(socket.user.id);

        // Notify others in the room
        socket.to(roomName).emit('userJoined', {
          user: {
            id: socket.user.id,
            username: socket.user.username,
            role: socket.user.role
          }
        });

        // Send chat history to the user
        const messages = await sequelize.query(
          `SELECT cm.id, cm.sender_id, cm.message, cm.message_type, cm.attachment_url, cm.created_at,
                  u.username, u.role
           FROM chat_messages cm
           JOIN users u ON cm.sender_id = u.id
           WHERE cm.room_id = :room_id AND cm.room_type = 'arbitrase'
           ORDER BY cm.created_at ASC
           LIMIT 50`,
          {
            replacements: { room_id: transaction.invoice_number },
            type: QueryTypes.SELECT
          }
        );

        socket.emit('chatHistory', {
          room_id: transaction.invoice_number,
          room_type: 'arbitrase',
          messages: messages
        });

        socket.emit('joinedRoom', { room_id: transaction.invoice_number, room_type: 'arbitrase' });

      } catch (error) {
        console.error('Join arbitrase chat error:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });
    
    // Handle sending messages
    socket.on('sendMessage', async (data) => {
      try {
        // Destructure data per requirements - accept both field naming conventions
        const { transactionId, roomId, message, attachment, room_type } = data;
        const senderId = socket.user.id;

        // Use either transactionId or roomId, and either message or messageText, and either attachment or attachmentUrl
        const finalTransactionId = transactionId || roomId;
        const finalMessage = message;
        const finalAttachment = attachment;
        const finalRoomType = room_type || 'arbitrase'; // Default to arbitrase if not specified

        // Validate required fields
        if (!finalTransactionId || !finalRoomType) {
          socket.emit('error', { message: 'Transaction ID and room type are required' });
          return;
        }

        // For image messages, either message text or attachment must be present
        if (!finalMessage && !finalAttachment) {
          socket.emit('error', { message: 'Message text or attachment is required' });
          return;
        }

        // Validate room type
        if (!['transaction', 'arbitrase'].includes(finalRoomType)) {
          socket.emit('error', { message: 'Invalid room type' });
          return;
        }

        // Verify user is part of this room
        const roomName = `${finalRoomType}_${finalTransactionId}`;
        if (!socket.rooms.has(roomName)) {
          socket.emit('error', { message: 'You are not in this room' });
          return;
        }

        // For arbitration rooms, only admins can send messages
        if (finalRoomType === 'arbitrase') {
          if (socket.user.role !== 'admin') {
            socket.emit('error', { message: 'Only admins can send messages in arbitration rooms' });
            return;
          }
        }

        // Determine message type based on presence of attachment
        let messageType = 'text';
        if (finalAttachment && !finalMessage) {
          messageType = 'image';
        } else if (finalAttachment && finalMessage) {
          messageType = 'text'; // Mixed content, default to text
        }

        // Save message to database
        const messageResult = await sequelize.query(
          `INSERT INTO chat_messages
           (room_id, room_type, sender_id, message, message_type, attachment_url)
           VALUES (:room_id, :room_type, :sender_id, :message, :message_type, :attachment_url)`,
          {
            replacements: {
              room_id: finalTransactionId,
              room_type: finalRoomType,
              sender_id: senderId,
              message: finalMessage || '',
              message_type: messageType,
              attachment_url: finalAttachment || null
            },
            type: QueryTypes.INSERT
          }
        );

        const messageId = messageResult[0];

        // Get message with user details
        const messageData = await sequelize.query(
          `SELECT cm.id, cm.room_id, cm.room_type, cm.sender_id, cm.message, cm.message_type, cm.attachment_url, cm.created_at,
                  u.username as sender_name, u.role
           FROM chat_messages cm
           JOIN users u ON cm.sender_id = u.id
           WHERE cm.id = :message_id`,
          {
            replacements: { message_id: messageId },
            type: QueryTypes.SELECT
          }
        );

        // Broadcast message to all users in the room
        io.to(roomName).emit('newMessage', messageData[0]);

        // Optional Telegram notification (non-blocking)
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.ADMIN_TELEGRAM_CHAT_ID) {
          // Send notification in the background to avoid blocking the message sending
          (async () => {
            try {
              const TelegramBot = require('node-telegram-bot-api');
              const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
              let adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;

              // Send notification to admin if sender is not admin
              if (socket.user.role !== 'admin') {
                let notificationMessage = `🔔 *New Arbitration Chat Message*\n\n`;
                notificationMessage += `*From:* ${socket.user.username} (${socket.user.role})\n`;
                notificationMessage += `*Transaction:* ${finalTransactionId}\n`;
                notificationMessage += `*Room Type:* ${finalRoomType}\n\n`;

                if (finalMessage) {
                  notificationMessage += `*Message:* ${finalMessage}\n`;
                }

                if (finalAttachment) {
                  notificationMessage += `*Attachment:* Image uploaded\n`;
                  // Try to send the image if it's a valid URL
                  try {
                    // Construct full URL for the attachment
                    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
                    const fullImageUrl = finalAttachment.startsWith('http') ? finalAttachment : `${baseUrl}${finalAttachment}`;

                    await bot.sendPhoto(adminChatId, fullImageUrl, {
                      caption: `Image from ${socket.user.username} regarding transaction ${finalTransactionId}`
                    });
                  } catch (imageError) {
                    console.error('Error sending image to Telegram:', imageError.message);
                    // If sending image fails, just send the text notification
                    await bot.sendMessage(adminChatId, notificationMessage, { parse_mode: 'Markdown' });
                  }
                } else {
                  await bot.sendMessage(adminChatId, notificationMessage, { parse_mode: 'Markdown' });
                }
              }
            } catch (telegramError) {
              console.error('Telegram notification error:', telegramError.message);
              // Don't let Telegram errors affect the main message sending functionality
            }
          })();
        }

      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });
    
    // Handle leaving rooms
    socket.on('leaveRoom', (data) => {
      try {
        const { room_id, room_type } = data;
        
        if (!room_id || !room_type) {
          return;
        }
        
        const roomName = `${room_type}_${room_id}`;
        socket.leave(roomName);
        
        // Remove from room participants
        if (roomParticipants.has(roomName)) {
          roomParticipants.get(roomName).delete(socket.user.id);
          
          // If room is empty, remove it from the map
          if (roomParticipants.get(roomName).size === 0) {
            roomParticipants.delete(roomName);
          }
        }
        
        // Notify others in the room
        socket.to(roomName).emit('userLeft', {
          user: {
            id: socket.user.id,
            username: socket.user.username,
            role: socket.user.role
          }
        });
        
        socket.emit('leftRoom', { room_id, room_type });
        
      } catch (error) {
        console.error('Leave room error:', error);
      }
    });
    
    // Handle typing indicators
    socket.on('typing', (data) => {
      try {
        const { room_id, room_type, isTyping } = data;
        
        if (!room_id || !room_type) {
          return;
        }
        
        const roomName = `${room_type}_${room_id}`;
        
        socket.to(roomName).emit('userTyping', {
          user: {
            id: socket.user.id,
            username: socket.user.username,
            role: socket.user.role
          },
          isTyping
        });
        
      } catch (error) {
        console.error('Typing indicator error:', error);
      }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.username} (${socket.user.role})`);
      
      // Remove from active users
      activeUsers.delete(socket.user.id);
      
      // Remove from all rooms
      roomParticipants.forEach((participants, roomName) => {
        if (participants.has(socket.user.id)) {
          participants.delete(socket.user.id);
          
          // Notify others in the room
          socket.to(roomName).emit('userLeft', {
            user: {
              id: socket.user.id,
              username: socket.user.username,
              role: socket.user.role
            }
          });
          
          // If room is empty, remove it from the map
          if (participants.size === 0) {
            roomParticipants.delete(roomName);
          }
        }
      });
    });
  });
  
  // Function to send notification to specific user
  const sendNotificationToUser = (userId, event, data) => {
    const socketId = activeUsers.get(userId);
    if (socketId) {
      io.to(socketId).emit(event, data);
    }
  };
  
  // Function to send notification to all users in a room
  const sendNotificationToRoom = (roomId, roomType, event, data) => {
    const roomName = `${roomType}_${roomId}`;
    io.to(roomName).emit(event, data);
  };
  
  // Expose helper functions
  return {
    sendNotificationToUser,
    sendNotificationToRoom,
    getActiveUsers: () => Array.from(activeUsers.keys()),
    getRoomParticipants: (roomId, roomType) => {
      const roomName = `${roomType}_${roomId}`;
      return roomParticipants.has(roomName) ? Array.from(roomParticipants.get(roomName)) : [];
    }
  };
};

module.exports = socketHandler;