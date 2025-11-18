const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath;
    
    // Determine upload path based on field name
    if (file.fieldname === 'ktp_image' || file.fieldname === 'ijazah_image') {
      uploadPath = path.join(__dirname, '../uploads/merchant');
    } else if (file.fieldname.startsWith('product_image')) {
      uploadPath = path.join(__dirname, '../uploads/products');
    } else {
      uploadPath = path.join(__dirname, '../uploads/others');
    }
    
    // Ensure directory exists
    ensureDirectoryExists(uploadPath);
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  // Check if the file is an image
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// Configure multer with storage and file filter
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB default
  }
});

// Specific upload handlers for different use cases
const uploadMerchantDocuments = upload.fields([
  { name: 'ktp_image', maxCount: 1 },
  { name: 'ijazah_image', maxCount: 1 }
]);

const uploadProductImages = upload.fields([
  { name: 'product_image1', maxCount: 1 },
  { name: 'product_image2', maxCount: 1 },
  { name: 'product_image3', maxCount: 1 },
  { name: 'product_image4', maxCount: 1 }
]);

// Single file upload for general use
const uploadSingle = (fieldName) => upload.single(fieldName);

// Multiple files upload for general use
const uploadMultiple = (fieldName, maxCount) => upload.array(fieldName, maxCount);

// Helper function to get file URL
const getFileUrl = (filePath) => {
  // Convert absolute path to relative URL path
  const relativePath = path.relative(path.join(__dirname, '../'), filePath);
  return `/${relativePath.replace(/\\/g, '/')}`;
};

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large',
        maxSize: process.env.MAX_FILE_SIZE || '5MB'
      });
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files uploaded'
      });
    } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field'
      });
    }
  } else if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'File upload error'
    });
  }
  next();
};

module.exports = {
  upload,
  uploadMerchantDocuments,
  uploadProductImages,
  uploadSingle,
  uploadMultiple,
  getFileUrl,
  handleUploadError
};