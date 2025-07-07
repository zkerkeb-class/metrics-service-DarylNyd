const jwt = require('jsonwebtoken');
const axios = require('axios');
const logger = require('../utils/logger');
const dotenv = require('dotenv');
dotenv.config();


const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Access token required',
                message: 'Please provide a valid Bearer token'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (!decoded.id) {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Token does not contain valid user information'
            });
        }

        // Verify user exists in auth service
        try {
            const authResponse = await axios.get(`${process.env.AUTH_SERVICE_URL}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                timeout: 5000
            });

            if (authResponse.status === 200) {
                req.user = authResponse.data;
                req.token = token;
                next();
            } else {
                return res.status(401).json({
                    error: 'Invalid token',
                    message: 'Token validation failed'
                });
            }
        } catch (authError) {
            logger.error('Auth service validation error:', authError.message);
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Unable to validate user token'
            });
        }
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Token is malformed or invalid'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Access token has expired'
            });
        }

        logger.error('Auth middleware error:', error);
        return res.status(500).json({
            error: 'Authentication error',
            message: 'Internal server error during authentication'
        });
    }
};

// Optional authentication middleware for public endpoints
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            req.user = null;
            return next();
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (decoded.id) {
            try {
                const authResponse = await axios.get(`${process.env.AUTH_SERVICE_URL}/auth/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    timeout: 5000
                });

                if (authResponse.status === 200) {
                    req.user = authResponse.data;
                    req.token = token;
                }
            } catch (authError) {
                logger.warn('Optional auth validation failed:', authError.message);
            }
        }
        
        next();
    } catch (error) {
        // For optional auth, we just continue without user info
        req.user = null;
        next();
    }
};

// Admin-only middleware
const adminOnly = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            error: 'Authentication required',
            message: 'User must be authenticated'
        });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Access denied',
            message: 'Admin privileges required'
        });
    }

    next();
};

module.exports = {
    authMiddleware,
    optionalAuth,
    adminOnly
}; 