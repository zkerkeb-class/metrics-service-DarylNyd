const express = require('express');
const { body, query, validationResult } = require('express-validator');
const PerformanceMetrics = require('../models/PerformanceMetrics');
const { updatePerformanceMetrics } = require('../utils/prometheus');
const logger = require('../utils/logger');
const { adminOnly } = require('../middleware/auth');
const os = require('os');

const router = express.Router();

// Track performance metrics
router.post('/track', [
    body('service').isIn(['auth', 'database', 'payment', 'metrics', 'frontend', 'ai-service']).withMessage('Invalid service'),
    body('endpoint').isString().notEmpty().withMessage('Endpoint is required'),
    body('method').isIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).withMessage('Invalid HTTP method'),
    body('statusCode').isInt({ min: 100, max: 599 }).withMessage('Invalid status code'),
    body('responseTime').isNumeric().withMessage('Response time is required'),
    body('requestSize').optional().isNumeric(),
    body('responseSize').optional().isNumeric(),
    body('error').optional().isString(),
    body('system').optional().isObject(),
    body('database').optional().isObject(),
    body('cache').optional().isObject()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation Error',
                details: errors.array()
            });
        }

        const {
            service,
            endpoint,
            method,
            statusCode,
            responseTime,
            requestSize = 0,
            responseSize = 0,
            error,
            system,
            database,
            cache
        } = req.body;

        const performanceMetric = new PerformanceMetrics({
            service,
            endpoint,
            method,
            userId: req.user?.id,
            requestId: req.headers['x-request-id'] || generateRequestId(),
            statusCode,
            responseTime,
            requestSize,
            responseSize,
            error,
            system: system || getSystemMetrics(),
            database,
            cache,
            metadata: {
                userAgent: req.get('User-Agent'),
                ipAddress: req.ip,
                userPlan: req.user?.plan || 'free',
                region: req.headers['x-region'],
                timezone: req.headers['x-timezone'],
                browser: extractBrowser(req.get('User-Agent')),
                os: extractOS(req.get('User-Agent')),
                deviceType: extractDeviceType(req.get('User-Agent'))
            }
        });

        await performanceMetric.save();

        // Update Prometheus metrics
        updatePerformanceMetrics.recordHttpRequest(service, endpoint, method, statusCode, responseTime);
        
        if (system) {
            updatePerformanceMetrics.setSystemMetrics(service, system.cpu?.usage || 0, system.memory?.percentage || 0, system.disk?.percentage || 0);
        }
        
        if (database) {
            updatePerformanceMetrics.setDatabaseMetrics(
                service,
                database.connectionPool?.active || 0,
                database.connectionPool?.idle || 0,
                database.connectionPool?.total || 0
            );
        }
        
        if (cache) {
            updatePerformanceMetrics.setCacheMetrics(service, 'redis', cache.hitRate || 0);
        }

        logger.info('Performance metric tracked', {
            service,
            endpoint,
            method,
            statusCode,
            responseTime,
            userId: req.user?.id
        });

        res.status(201).json({
            message: 'Performance metric tracked successfully',
            metricId: performanceMetric._id
        });
    } catch (error) {
        logger.error('Error tracking performance metric:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to track performance metric'
        });
    }
});

// Get performance statistics
router.get('/stats', [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('service').optional().isString(),
    query('endpoint').optional().isString(),
    query('method').optional().isString(),
    query('statusCode').optional().isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation Error',
                details: errors.array()
            });
        }

        const filters = {
            userId: req.user?.id,
            ...req.query
        };

        const stats = await PerformanceMetrics.getPerformanceStats(filters);

        res.json({
            stats,
            filters: req.query
        });
    } catch (error) {
        logger.error('Error getting performance stats:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get performance statistics'
        });
    }
});

// Get slowest endpoints
router.get('/slowest-endpoints', [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('service').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation Error',
                details: errors.array()
            });
        }

        const filters = req.query;
        const limit = parseInt(req.query.limit) || 10;
        const slowestEndpoints = await PerformanceMetrics.getSlowestEndpoints(filters, limit);

        res.json({
            slowestEndpoints,
            filters: req.query
        });
    } catch (error) {
        logger.error('Error getting slowest endpoints:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get slowest endpoints'
        });
    }
});

// Get error rates
router.get('/error-rates', [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('service').optional().isString()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation Error',
                details: errors.array()
            });
        }

        const filters = req.query;
        const errorRates = await PerformanceMetrics.getErrorRates(filters);

        res.json({
            errorRates,
            filters: req.query
        });
    } catch (error) {
        logger.error('Error getting error rates:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get error rates'
        });
    }
});

// Get system resource usage
router.get('/system-resources', [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('service').optional().isString()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation Error',
                details: errors.array()
            });
        }

        const filters = req.query;
        const systemResources = await PerformanceMetrics.getSystemResources(filters);

        res.json({
            systemResources,
            filters: req.query
        });
    } catch (error) {
        logger.error('Error getting system resources:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get system resources'
        });
    }
});

// Get current system metrics
router.get('/current-system', async (req, res) => {
    try {
        const currentMetrics = getSystemMetrics();
        
        res.json({
            currentMetrics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting current system metrics:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get current system metrics'
        });
    }
});

// Admin endpoints
router.get('/admin/stats', adminOnly, [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('service').optional().isString(),
    query('endpoint').optional().isString(),
    query('method').optional().isString(),
    query('statusCode').optional().isInt()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation Error',
                details: errors.array()
            });
        }

        const filters = req.query;
        const stats = await PerformanceMetrics.getPerformanceStats(filters);
        const slowestEndpoints = await PerformanceMetrics.getSlowestEndpoints(filters, 10);
        const errorRates = await PerformanceMetrics.getErrorRates(filters);
        const systemResources = await PerformanceMetrics.getSystemResources(filters);

        // Get service performance comparison
        const servicePerformance = await PerformanceMetrics.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: '$service',
                    avgResponseTime: { $avg: '$responseTime' },
                    totalRequests: { $sum: 1 },
                    errorCount: {
                        $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
                    },
                    avgCpuUsage: { $avg: '$system.cpu.usage' },
                    avgMemoryUsage: { $avg: '$system.memory.percentage' }
                }
            },
            {
                $project: {
                    service: '$_id',
                    avgResponseTime: 1,
                    totalRequests: 1,
                    errorCount: 1,
                    errorRate: {
                        $multiply: [
                            { $divide: ['$errorCount', '$totalRequests'] },
                            100
                        ]
                    },
                    avgCpuUsage: 1,
                    avgMemoryUsage: 1
                }
            },
            { $sort: { avgResponseTime: -1 } }
        ]);

        res.json({
            stats,
            slowestEndpoints,
            errorRates,
            systemResources,
            servicePerformance,
            filters: req.query
        });
    } catch (error) {
        logger.error('Error getting admin performance stats:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get performance statistics'
        });
    }
});

// Get performance alerts (endpoints with high error rates or slow response times)
router.get('/admin/alerts', adminOnly, [
    query('errorRateThreshold').optional().isFloat({ min: 0, max: 100 }).withMessage('Error rate threshold must be between 0 and 100'),
    query('responseTimeThreshold').optional().isFloat({ min: 0 }).withMessage('Response time threshold must be positive')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation Error',
                details: errors.array()
            });
        }

        const errorRateThreshold = parseFloat(req.query.errorRateThreshold) || 5; // 5% default
        const responseTimeThreshold = parseFloat(req.query.responseTimeThreshold) || 2000; // 2 seconds default

        // Get endpoints with high error rates
        const highErrorEndpoints = await PerformanceMetrics.aggregate([
            {
                $group: {
                    _id: {
                        service: '$service',
                        endpoint: '$endpoint',
                        method: '$method'
                    },
                    totalRequests: { $sum: 1 },
                    errorCount: {
                        $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
                    },
                    avgResponseTime: { $avg: '$responseTime' }
                }
            },
            {
                $project: {
                    service: '$_id.service',
                    endpoint: '$_id.endpoint',
                    method: '$_id.method',
                    totalRequests: 1,
                    errorCount: 1,
                    errorRate: {
                        $multiply: [
                            { $divide: ['$errorCount', '$totalRequests'] },
                            100
                        ]
                    },
                    avgResponseTime: 1
                }
            },
            {
                $match: {
                    $or: [
                        { errorRate: { $gte: errorRateThreshold } },
                        { avgResponseTime: { $gte: responseTimeThreshold } }
                    ]
                }
            },
            { $sort: { errorRate: -1, avgResponseTime: -1 } }
        ]);

        res.json({
            alerts: highErrorEndpoints,
            thresholds: {
                errorRate: errorRateThreshold,
                responseTime: responseTimeThreshold
            }
        });
    } catch (error) {
        logger.error('Error getting performance alerts:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get performance alerts'
        });
    }
});

// Helper functions
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getSystemMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryPercentage = (usedMem / totalMem) * 100;

    // Note: CPU usage calculation is simplified
    // In production, you might want to use a more sophisticated approach
    const cpuUsage = Math.random() * 100; // Placeholder

    return {
        cpu: {
            usage: cpuUsage,
            load: os.loadavg()
        },
        memory: {
            used: usedMem / (1024 * 1024), // MB
            total: totalMem / (1024 * 1024), // MB
            percentage: memoryPercentage
        },
        disk: {
            used: 0, // Would need to implement disk usage calculation
            total: 0,
            percentage: 0
        },
        network: {
            bytesIn: 0, // Would need to implement network monitoring
            bytesOut: 0,
            connections: 0
        }
    };
}

function extractBrowser(userAgent) {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    return 'Unknown';
}

function extractOS(userAgent) {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac OS')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown';
}

function extractDeviceType(userAgent) {
    if (!userAgent) return 'desktop';
    if (/mobile/i.test(userAgent)) return 'mobile';
    if (/tablet/i.test(userAgent)) return 'tablet';
    return 'desktop';
}

module.exports = router; 