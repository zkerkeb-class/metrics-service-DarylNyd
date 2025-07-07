const express = require('express');
const { query, validationResult } = require('express-validator');
const AIRequest = require('../models/AIRequest');
const UserEngagement = require('../models/UserEngagement');
const SalesAnalytics = require('../models/SalesAnalytics');
const PerformanceMetrics = require('../models/PerformanceMetrics');
const logger = require('../utils/logger');
const { adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get dashboard overview metrics
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.user?.id;
        const isAdmin = req.user?.role === 'admin';

        // Get date range (last 30 days by default)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const filters = {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        };

        // Get AI request metrics
        const aiStats = await AIRequest.getStats(isAdmin ? filters : { ...filters, userId });

        // Get user engagement metrics
        const engagementStats = await UserEngagement.getEngagementStats(isAdmin ? filters : { ...filters, userId });

        // Get sales metrics (admin only or user's own)
        let salesStats = null;
        if (isAdmin) {
            salesStats = await SalesAnalytics.getSalesStats(filters);
        } else if (userId) {
            salesStats = await SalesAnalytics.getSalesStats({ ...filters, userId });
        }

        // Get performance metrics
        const performanceStats = await PerformanceMetrics.getPerformanceStats(isAdmin ? filters : { ...filters, userId });

        // Calculate key performance indicators
        const kpis = {
            aiRequests: {
                total: aiStats.totalRequests,
                successRate: aiStats.totalRequests > 0 ? (aiStats.successCount / aiStats.totalRequests) * 100 : 0,
                avgResponseTime: aiStats.avgDuration || 0,
                totalCost: aiStats.totalCost || 0
            },
            userEngagement: {
                totalEvents: engagementStats.totalEvents,
                uniqueUsers: engagementStats.uniqueUsers,
                avgTimeOnPage: engagementStats.avgTimeOnPage || 0,
                sessionCount: engagementStats.uniqueSessions
            },
            performance: {
                avgResponseTime: performanceStats.avgResponseTime || 0,
                errorRate: performanceStats.totalRequests > 0 ? (performanceStats.errorCount / performanceStats.totalRequests) * 100 : 0,
                totalRequests: performanceStats.totalRequests
            }
        };

        if (salesStats) {
            kpis.sales = {
                totalRevenue: salesStats.totalRevenue || 0,
                totalTransactions: salesStats.totalTransactions,
                avgTransactionValue: salesStats.avgTransactionValue || 0,
                successRate: salesStats.totalTransactions > 0 ? (salesStats.successfulTransactions / salesStats.totalTransactions) * 100 : 0
            };
        }

        res.json({
            kpis,
            dateRange: {
                startDate: filters.startDate,
                endDate: filters.endDate
            },
            isAdmin
        });
    } catch (error) {
        logger.error('Error getting dashboard metrics:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get dashboard metrics'
        });
    }
});

// Get metrics summary for a specific time period
router.get('/summary', [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('groupBy').optional().isIn(['hour', 'day', 'week', 'month']).withMessage('Invalid group by option')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation Error',
                details: errors.array()
            });
        }

        const userId = req.user?.id;
        const isAdmin = req.user?.role === 'admin';
        const groupBy = req.query.groupBy || 'day';

        // Set default date range if not provided
        let startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
        let endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
        
        if (!req.query.startDate) {
            startDate.setDate(startDate.getDate() - 30);
        }

        const filters = {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        };

        // Get time series data
        const timeSeriesData = await getTimeSeriesData(
            isAdmin ? filters : { ...filters, userId },
            groupBy
        );

        res.json({
            timeSeriesData,
            dateRange: {
                startDate: filters.startDate,
                endDate: filters.endDate
            },
            groupBy
        });
    } catch (error) {
        logger.error('Error getting metrics summary:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get metrics summary'
        });
    }
});

// Get top metrics (most used features, popular models, etc.)
router.get('/top-metrics', [
    query('metric').isIn(['ai-models', 'features', 'endpoints', 'users', 'revenue']).withMessage('Invalid metric type'),
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

        const userId = req.user?.id;
        const isAdmin = req.user?.role === 'admin';
        const metric = req.query.metric;
        const limit = parseInt(req.query.limit) || 10;

        let topMetrics = [];

        switch (metric) {
            case 'ai-models':
                topMetrics = await getTopAIModels(isAdmin ? {} : { userId }, limit);
                break;
            case 'features':
                topMetrics = await getTopFeatures(isAdmin ? {} : { userId }, limit);
                break;
            case 'endpoints':
                topMetrics = await getTopEndpoints(isAdmin ? {} : { userId }, limit);
                break;
            case 'users':
                if (!isAdmin) {
                    return res.status(403).json({
                        error: 'Access Denied',
                        message: 'Admin privileges required for user metrics'
                    });
                }
                topMetrics = await getTopUsers(limit);
                break;
            case 'revenue':
                if (!isAdmin) {
                    return res.status(403).json({
                        error: 'Access Denied',
                        message: 'Admin privileges required for revenue metrics'
                    });
                }
                topMetrics = await getTopRevenue(limit);
                break;
        }

        res.json({
            metric,
            topMetrics,
            limit
        });
    } catch (error) {
        logger.error('Error getting top metrics:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get top metrics'
        });
    }
});

// Get metrics comparison (period over period)
router.get('/comparison', [
    query('metric').isIn(['ai-requests', 'engagement', 'sales', 'performance']).withMessage('Invalid metric type'),
    query('currentStart').isISO8601().withMessage('Invalid current start date'),
    query('currentEnd').isISO8601().withMessage('Invalid current end date'),
    query('previousStart').isISO8601().withMessage('Invalid previous start date'),
    query('previousEnd').isISO8601().withMessage('Invalid previous end date')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation Error',
                details: errors.array()
            });
        }

        const userId = req.user?.id;
        const isAdmin = req.user?.role === 'admin';
        const metric = req.query.metric;

        const currentFilters = {
            startDate: req.query.currentStart,
            endDate: req.query.currentEnd
        };

        const previousFilters = {
            startDate: req.query.previousStart,
            endDate: req.query.previousEnd
        };

        let currentData, previousData;

        switch (metric) {
            case 'ai-requests':
                currentData = await AIRequest.getStats(isAdmin ? currentFilters : { ...currentFilters, userId });
                previousData = await AIRequest.getStats(isAdmin ? previousFilters : { ...previousFilters, userId });
                break;
            case 'engagement':
                currentData = await UserEngagement.getEngagementStats(isAdmin ? currentFilters : { ...currentFilters, userId });
                previousData = await UserEngagement.getEngagementStats(isAdmin ? previousFilters : { ...previousFilters, userId });
                break;
            case 'sales':
                if (!isAdmin) {
                    return res.status(403).json({
                        error: 'Access Denied',
                        message: 'Admin privileges required for sales metrics'
                    });
                }
                currentData = await SalesAnalytics.getSalesStats(currentFilters);
                previousData = await SalesAnalytics.getSalesStats(previousFilters);
                break;
            case 'performance':
                currentData = await PerformanceMetrics.getPerformanceStats(isAdmin ? currentFilters : { ...currentFilters, userId });
                previousData = await PerformanceMetrics.getPerformanceStats(isAdmin ? previousFilters : { ...previousFilters, userId });
                break;
        }

        // Calculate percentage changes
        const comparison = calculatePercentageChange(currentData, previousData);

        res.json({
            metric,
            current: currentData,
            previous: previousData,
            comparison,
            periods: {
                current: { start: req.query.currentStart, end: req.query.currentEnd },
                previous: { start: req.query.previousStart, end: req.query.previousEnd }
            }
        });
    } catch (error) {
        logger.error('Error getting metrics comparison:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get metrics comparison'
        });
    }
});

// Helper functions
async function getTimeSeriesData(filters, groupBy) {
    const dateFormat = {
        hour: '%Y-%m-%d %H:00:00',
        day: '%Y-%m-%d',
        week: '%Y-%U',
        month: '%Y-%m'
    }[groupBy];

    const aiRequests = await AIRequest.aggregate([
        { $match: filters },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: dateFormat,
                        date: '$createdAt'
                    }
                },
                count: { $sum: 1 },
                totalCost: { $sum: '$cost' },
                avgDuration: { $avg: '$performance.duration' }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    const engagement = await UserEngagement.aggregate([
        { $match: filters },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: dateFormat,
                        date: '$timestamp'
                    }
                },
                events: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' }
            }
        },
        {
            $project: {
                _id: 1,
                events: 1,
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return {
        aiRequests,
        engagement
    };
}

async function getTopAIModels(filters, limit) {
    return await AIRequest.aggregate([
        { $match: filters },
        {
            $group: {
                _id: '$model',
                count: { $sum: 1 },
                avgDuration: { $avg: '$performance.duration' },
                totalCost: { $sum: '$cost' }
            }
        },
        { $sort: { count: -1 } },
        { $limit: limit }
    ]);
}

async function getTopFeatures(filters, limit) {
    return await UserEngagement.aggregate([
        { $match: { ...filters, feature: { $exists: true, $ne: null } } },
        {
            $group: {
                _id: '$feature',
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' }
            }
        },
        {
            $project: {
                feature: '$_id',
                count: 1,
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        },
        { $sort: { count: -1 } },
        { $limit: limit }
    ]);
}

async function getTopEndpoints(filters, limit) {
    return await PerformanceMetrics.aggregate([
        { $match: filters },
        {
            $group: {
                _id: {
                    service: '$service',
                    endpoint: '$endpoint',
                    method: '$method'
                },
                count: { $sum: 1 },
                avgResponseTime: { $avg: '$responseTime' },
                errorCount: {
                    $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
                }
            }
        },
        {
            $project: {
                service: '$_id.service',
                endpoint: '$_id.endpoint',
                method: '$_id.method',
                count: 1,
                avgResponseTime: 1,
                errorCount: 1,
                errorRate: {
                    $multiply: [
                        { $divide: ['$errorCount', '$count'] },
                        100
                    ]
                }
            }
        },
        { $sort: { count: -1 } },
        { $limit: limit }
    ]);
}

async function getTopUsers(limit) {
    return await UserEngagement.aggregate([
        {
            $group: {
                _id: '$userId',
                eventCount: { $sum: 1 },
                lastActivity: { $max: '$timestamp' }
            }
        },
        { $sort: { eventCount: -1 } },
        { $limit: limit }
    ]);
}

async function getTopRevenue(limit) {
    return await SalesAnalytics.aggregate([
        { $match: { status: 'completed' } },
        {
            $group: {
                _id: '$userId',
                totalRevenue: { $sum: '$amount' },
                transactionCount: { $sum: 1 }
            }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: limit }
    ]);
}

function calculatePercentageChange(current, previous) {
    const changes = {};
    
    for (const key in current) {
        if (typeof current[key] === 'number' && typeof previous[key] === 'number') {
            if (previous[key] === 0) {
                changes[key] = current[key] > 0 ? 100 : 0;
            } else {
                changes[key] = ((current[key] - previous[key]) / previous[key]) * 100;
            }
        }
    }
    
    return changes;
}

module.exports = router; 