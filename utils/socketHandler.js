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

      // Verify JWT token (you might want to use the same verification logic as in authMiddleware)
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user details from database
      const users = await sequelize.query(
        'SELECT id, username, role FROM users WHERE id = :user_id',
        {
          replacements: { user_id: decoded.id },
          type: QueryTypes.SELECT
        }
      );

      if (users.length === 0) {
        return next(new Error('User not found'));
      }

      socket.user = users[0];
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error'));
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
          `SELECT cm.id, cm.sender_id, cm.message, cm.message_type, cm.created_at,
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
        const { transaction_id } = data;
        
        if (!transaction_id) {
          socket.emit('error', { message: 'Transaction ID is required' });
          return;
        }
        
        // Verify transaction exists and is in a state that requires arbitrase
        const transactions = await sequelize.query(
          `SELECT t.id, t.buyer_id, t.merchant_id, t.status, m.user_id as merchant_user_id
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
        
        // Join arbitrase room
        const roomName = `arbitrase_${transaction_id}`;
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
          `SELECT cm.id, cm.sender_id, cm.message, cm.message_type, cm.created_at,
                  u.username, u.role
           FROM chat_messages cm
           JOIN users u ON cm.sender_id = u.id
           WHERE cm.room_id = :room_id AND cm.room_type = 'arbitrase'
           ORDER BY cm.created_at ASC
           LIMIT 50`,
          {
            replacements: { room_id: transaction_id },
            type: QueryTypes.SELECT
          }
        );
        
        socket.emit('chatHistory', {
          room_id: transaction_id,
          room_type: 'arbitrase',
          messages: messages
        });
        
        socket.emit('joinedRoom', { room_id: transaction_id, room_type: 'arbitrase' });
        
      } catch (error) {
        console.error('Join arbitrase chat error:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });
    
    // Handle sending messages
    socket.on('sendMessage', async (data) => {
      try {
        const { room_id, room_type, message, message_type = 'text' } = data;
        
        if (!room_id || !room_type || !message) {
          socket.emit('error', { message: 'Room ID, room type, and message are required' });
          return;
        }
        
        // Validate room type
        if (!['transaction', 'arbitrase'].includes(room_type)) {
          socket.emit('error', { message: 'Invalid room type' });
          return;
        }
        
        // Verify user is part of this room
        const roomName = `${room_type}_${room_id}`;
        if (!socket.rooms.has(roomName)) {
          socket.emit('error', { message: 'You are not in this room' });
          return;
        }
        
        // Save message to database
        const messageResult = await sequelize.query(
          `INSERT INTO chat_messages 
           (room_id, room_type, sender_id, message, message_type) 
           VALUES (:room_id, :room_type, :sender_id, :message, :message_type)`,
          {
            replacements: {
              room_id,
              room_type,
              sender_id: socket.user.id,
              message,
              message_type
            },
            type: QueryTypes.INSERT
          }
        );
        
        const messageId = messageResult[0];
        
        // Get message with user details
        const messageData = await sequelize.query(
          `SELECT cm.id, cm.sender_id, cm.message, cm.message_type, cm.created_at,
                  u.username, u.role
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