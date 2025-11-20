-- Add attachment_url column to chat_messages table for image/file uploads
ALTER TABLE chat_messages 
ADD COLUMN attachment_url VARCHAR(255) NULL;

-- Update the message_type enum to ensure it includes 'image'
ALTER TABLE chat_messages 
MODIFY COLUMN message_type ENUM('text', 'image', 'file', 'system') DEFAULT 'text';