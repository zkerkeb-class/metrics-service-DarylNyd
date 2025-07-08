const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error('Error occurred:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            message: err.message,
            details: process.env.NODE_ENV === 'development' ? err.errors : undefined
        });
    }

    if (err.name === 'CastError') {
        return res.status(400).json({
            error: 'Invalid ID',
            message: 'The provided ID is not valid'
        });
    }

    if (err.name === 'MongoError' && err.code === 11000) {
        return res.status(409).json({
            error: 'Duplicate Entry',
            message: 'A record with this information already exists'
        });
    }

    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Invalid Token',
            message: 'The provided token is invalid'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'Token Expired',
            message: 'The provided token has expired'
        });
    }

    // Handle axios errors
    if (err.isAxiosError) {
        const status = err.response?.status || 500;
        const message = err.response?.data?.message || err.message;
        
        return res.status(status).json({
            error: 'External Service Error',
            message: message,
            service: err.config?.url
        });
    }

    // Handle rate limiting errors
    if (err.status === 429) {
        return res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.'
        });
    }

    // Default error response
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        error: 'Server Error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : message,
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
            details: err
        })
    });
};

// 404 handler
const notFoundHandler = (req, res) => {
    logger.warn('Route not found:', {
        url: req.url,
        method: req.method,
        ip: req.ip
    });

    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.url} not found`
    });
};

module.exports = {
    errorHandler,
    notFoundHandler
}; 