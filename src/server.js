require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const promClient = require('prom-client');

// Import custom modules
const logger = require('./utils/logger');
const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const metricsRoutes = require('./routes/metrics');
const aiTrackingRoutes = require('./routes/aiTracking');
const analyticsRoutes = require('./routes/analytics');
const performanceRoutes = require('./routes/performance');
const { errorHandler } = require('./middleware/errorHandler');
const { authMiddleware } = require('./middleware/auth');

const app = express();

// Initialize Prometheus metrics
const register = promClient.register;
// Prevent duplicate metric registration in development (e.g., with nodemon)
if (process.env.NODE_ENV !== 'production') {
    register.clear();
}
promClient.collectDefaultMetrics({ register });

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.'
    }
});
app.use(limiter);

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Metrics Service',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        version: require('../package.json').version
    });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (error) {
        logger.error('Error generating metrics:', error);
        res.status(500).end();
    }
});

// API routes
app.use('/api/metrics', authMiddleware, metricsRoutes);
app.use('/api/ai-tracking', authMiddleware, aiTrackingRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/performance', authMiddleware, performanceRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl
    });
});

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

const PORT = process.env.PORT || 5005;

// Start server
const startServer = async () => {
    try {
        // Connect to databases
        await connectDB();
        await connectRedis();
        
        app.listen(PORT, () => {
            logger.info(`Metrics service running on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV}`);
            logger.info(`Prometheus metrics available at: http://localhost:${PORT}/metrics`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

module.exports = app; 