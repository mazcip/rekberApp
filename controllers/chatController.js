const db = require('../config/database');

/**
 * Get chat history for a specific room
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getChatHistory = async (req, res) => {
  try {
    const { roomId } = req.params;
    
    // Query chat_messages table joined with users to get sender info
    const query = `
      SELECT 
        cm.id,
        cm.sender_id,
        u.username,
        u.role,
        cm.message,
        cm.attachment_url,
        cm.created_at
      FROM chat_messages cm
      LEFT JOIN users u ON cm.sender_id = u.id
      WHERE cm.room_id = ?
      ORDER BY cm.created_at ASC
    `;
    
    const [messages] = await db.execute(query, [roomId]);
    
    res.status(200).json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Error getting chat history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve chat history',
      error: error.message
    });
  }
};

/**
 * Upload chat attachment
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const uploadChatAttachment = async (req, res) => {
  try {
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Construct the file URL
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/chats/${req.file.filename}`;
    
    res.status(200).json({
      success: true,
      url: fileUrl
    });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload attachment',
      error: error.message
    });
  }
};

module.exports = {
  getChatHistory,
  uploadChatAttachment
};