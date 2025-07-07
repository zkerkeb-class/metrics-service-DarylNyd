const express = require('express');
const { body, query, validationResult } = require('express-validator');
const UserEngagement = require('../models/UserEngagement');
const SalesAnalytics = require('../models/SalesAnalytics');
const { updateEngagementMetrics, updateSalesMetrics } = require('../utils/prometheus');
const logger = require('../utils/logger');
const { adminOnly } = require('../middleware/auth');

const router = express.Router();

// Track user engagement event
router.post('/engagement/track', [
    body('event').isIn([
        'page_view', 'feature_usage', 'ai_request', 'subscription_upgrade',
        'subscription_downgrade', 'payment_success', 'payment_failed',
        'login', 'logout', 'registration', 'profile_update',
        'artwork_upload', 'artwork_analysis', 'portfolio_view',
        'market_analysis', 'style_recommendation', 'search', 'filter',
        'export', 'share', 'feedback', 'support_request'
    ]).withMessage('Invalid event type'),
    body('sessionId').isString().notEmpty().withMessage('Session ID is required'),
    body('page').optional().isString(),
    body('feature').optional().isIn([
        'artwork-analysis', 'style-recommendation', 'market-analysis',
        'portfolio-review', 'ai-chat', 'export', 'share', 'premium-features'
    ]),
    body('value').optional().isNumeric(),
    body('properties').optional().isObject()
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
            event,
            sessionId,
            page,
            feature,
            value = 0,
            properties = {}
        } = req.body;

        // Extract device information from User-Agent
        const userAgent = req.get('User-Agent') || '';
        let deviceType = 'desktop';
        if (/mobile/i.test(userAgent)) deviceType = 'mobile';
        else if (/tablet/i.test(userAgent)) deviceType = 'tablet';

        const engagement = new UserEngagement({
            userId: req.user.id,
            sessionId,
            event,
            page,
            feature,
            value,
            properties,
            userPlan: req.user.plan || 'free',
            metadata: {
                userAgent,
                ipAddress: req.ip,
                referrer: req.get('Referrer'),
                utmSource: req.query.utm_source,
                utmMedium: req.query.utm_medium,
                utmCampaign: req.query.utm_campaign,
                deviceType,
                browser: extractBrowser(userAgent),
                os: extractOS(userAgent),
                screenResolution: req.headers['x-screen-resolution'],
                timeOnPage: parseInt(req.headers['x-time-on-page']) || 0,
                scrollDepth: parseInt(req.headers['x-scroll-depth']) || 0,
                clicks: parseInt(req.headers['x-clicks']) || 0,
                formInteractions: parseInt(req.headers['x-form-interactions']) || 0
            }
        });

        await engagement.save();

        // Update Prometheus metrics
        updateEngagementMetrics.incrementEvent(
            event,
            feature,
            req.user.plan || 'free',
            deviceType
        );

        logger.info('User engagement tracked', {
            userId: req.user.id,
            event,
            feature,
            sessionId
        });

        res.status(201).json({
            message: 'Engagement event tracked successfully',
            eventId: engagement._id
        });
    } catch (error) {
        logger.error('Error tracking engagement event:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to track engagement event'
        });
    }
});

// Track sales transaction
router.post('/sales/track', [
    body('transactionId').isString().notEmpty().withMessage('Transaction ID is required'),
    body('type').isIn(['subscription', 'one_time', 'refund', 'credit', 'debit']).withMessage('Invalid transaction type'),
    body('amount').isNumeric().withMessage('Amount is required'),
    body('currency').optional().isString(),
    body('status').isIn(['pending', 'completed', 'failed', 'cancelled', 'refunded']).withMessage('Invalid status'),
    body('paymentMethod').optional().isIn(['stripe', 'paypal', 'apple_pay', 'google_pay', 'bank_transfer', 'crypto']),
    body('plan').optional().isIn(['free', 'basic', 'premium'])
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
            transactionId,
            type,
            amount,
            currency = 'USD',
            status,
            paymentMethod,
            plan = 'free',
            subscription,
            refund
        } = req.body;

        // Check if transaction already exists
        const existingTransaction = await SalesAnalytics.findOne({ transactionId });
        if (existingTransaction) {
            return res.status(409).json({
                error: 'Transaction already exists',
                message: 'A transaction with this ID has already been tracked'
            });
        }

        const salesTransaction = new SalesAnalytics({
            userId: req.user.id,
            transactionId,
            type,
            amount,
            currency,
            status,
            paymentMethod,
            plan,
            subscription,
            refund,
            metadata: {
                userAgent: req.get('User-Agent'),
                ipAddress: req.ip,
                source: req.headers['x-source'] || 'web',
                campaign: req.headers['x-campaign'],
                utmSource: req.query.utm_source,
                utmMedium: req.query.utm_medium,
                utmCampaign: req.query.utm_campaign,
                referrer: req.get('Referrer')
            }
        });

        await salesTransaction.save();

        // Update Prometheus metrics
        updateSalesMetrics.incrementTransaction(type, status, plan, paymentMethod);
        if (status === 'completed') {
            updateSalesMetrics.incrementRevenue(type, plan, currency, amount);
        }

        logger.info('Sales transaction tracked', {
            userId: req.user.id,
            transactionId,
            type,
            amount,
            status
        });

        res.status(201).json({
            message: 'Sales transaction tracked successfully',
            transactionId: salesTransaction.transactionId
        });
    } catch (error) {
        logger.error('Error tracking sales transaction:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to track sales transaction'
        });
    }
});

// Get user engagement statistics
router.get('/engagement/stats', [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('event').optional().isString(),
    query('feature').optional().isString()
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
            userId: req.user.id,
            ...req.query
        };

        const stats = await UserEngagement.getEngagementStats(filters);
        const eventDistribution = await UserEngagement.getEventDistribution(filters);

        res.json({
            stats,
            eventDistribution,
            filters: req.query
        });
    } catch (error) {
        logger.error('Error getting engagement stats:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get engagement statistics'
        });
    }
});

// Get user journey
router.get('/engagement/journey', [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation Error',
                details: errors.array()
            });
        }

        const limit = parseInt(req.query.limit) || 50;
        const journey = await UserEngagement.getUserJourney(req.user.id, limit);

        res.json({
            journey,
            userId: req.user.id
        });
    } catch (error) {
        logger.error('Error getting user journey:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get user journey'
        });
    }
});

// Get sales statistics
router.get('/sales/stats', [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('type').optional().isString(),
    query('status').optional().isString(),
    query('plan').optional().isString()
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
            userId: req.user.id,
            ...req.query
        };

        const stats = await SalesAnalytics.getSalesStats(filters);
        const revenueByPlan = await SalesAnalytics.getRevenueByPlan(filters);
        const clv = await SalesAnalytics.getCustomerLifetimeValue(req.user.id);

        res.json({
            stats,
            revenueByPlan,
            customerLifetimeValue: clv,
            filters: req.query
        });
    } catch (error) {
        logger.error('Error getting sales stats:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get sales statistics'
        });
    }
});

// Admin endpoints
router.get('/admin/engagement/stats', adminOnly, [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('event').optional().isString(),
    query('feature').optional().isString(),
    query('userPlan').optional().isString()
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
        const stats = await UserEngagement.getEngagementStats(filters);
        const eventDistribution = await UserEngagement.getEventDistribution(filters);

        // Get user activity by plan
        const activityByPlan = await UserEngagement.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: '$userPlan',
                    totalEvents: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$userId' },
                    avgTimeOnPage: { $avg: '$metadata.timeOnPage' }
                }
            },
            {
                $project: {
                    plan: '$_id',
                    totalEvents: 1,
                    uniqueUsers: { $size: '$uniqueUsers' },
                    avgTimeOnPage: 1
                }
            },
            { $sort: { totalEvents: -1 } }
        ]);

        res.json({
            stats,
            eventDistribution,
            activityByPlan,
            filters: req.query
        });
    } catch (error) {
        logger.error('Error getting admin engagement stats:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get engagement statistics'
        });
    }
});

router.get('/admin/sales/stats', adminOnly, [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('type').optional().isString(),
    query('status').optional().isString(),
    query('plan').optional().isString()
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
        const stats = await SalesAnalytics.getSalesStats(filters);
        const revenueByPlan = await SalesAnalytics.getRevenueByPlan(filters);
        const mrr = await SalesAnalytics.getMRR();

        // Get payment method distribution
        const paymentMethodDistribution = await SalesAnalytics.aggregate([
            { $match: { ...filters, status: 'completed' } },
            {
                $group: {
                    _id: '$paymentMethod',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    avgAmount: { $avg: '$amount' }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);

        res.json({
            stats,
            revenueByPlan,
            monthlyRecurringRevenue: mrr,
            paymentMethodDistribution,
            filters: req.query
        });
    } catch (error) {
        logger.error('Error getting admin sales stats:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get sales statistics'
        });
    }
});

// Helper functions
function extractBrowser(userAgent) {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    return 'Unknown';
}

function extractOS(userAgent) {
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac OS')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown';
}

module.exports = router; 