const express = require('express');
const { body, query, validationResult } = require('express-validator');
const AIRequest = require('../models/AIRequest');
const { updateAIMetrics } = require('../utils/prometheus');
const logger = require('../utils/logger');
const { adminOnly } = require('../middleware/auth');

const router = express.Router();

// Track a new AI request
router.post('/track', [
    body('requestId').isString().notEmpty().withMessage('Request ID is required'),
    body('model').isIn(['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'gemini-pro', 'custom']).withMessage('Invalid model'),
    body('prompt').isString().notEmpty().withMessage('Prompt is required'),
    body('feature').optional().isIn(['artwork-analysis', 'style-recommendation', 'market-analysis', 'portfolio-review', 'other']),
    body('complexity').optional().isIn(['simple', 'medium', 'complex']),
    body('language').optional().isString(),
    body('userPlan').optional().isIn(['free', 'basic', 'premium'])
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
            requestId,
            model,
            prompt,
            feature = 'other',
            complexity = 'medium',
            language = 'en',
            userPlan = 'free'
        } = req.body;

        // Check if request already exists
        const existingRequest = await AIRequest.findOne({ requestId });
        if (existingRequest) {
            return res.status(409).json({
                error: 'Request already exists',
                message: 'A request with this ID has already been tracked'
            });
        }

        const aiRequest = new AIRequest({
            userId: req.user.id,
            requestId,
            model,
            prompt,
            metadata: {
                userAgent: req.get('User-Agent'),
                ipAddress: req.ip,
                sessionId: req.headers['x-session-id'],
                feature,
                complexity,
                language
            },
            userPlan,
            performance: {
                startTime: new Date()
            }
        });

        await aiRequest.save();

        // Update Prometheus metrics
        updateAIMetrics.incrementRequest(model, 'pending', feature, userPlan);

        logger.info('AI request tracked', {
            requestId,
            userId: req.user.id,
            model,
            feature
        });

        res.status(201).json({
            message: 'AI request tracked successfully',
            requestId: aiRequest.requestId
        });
    } catch (error) {
        logger.error('Error tracking AI request:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to track AI request'
        });
    }
});

// Update AI request status and response
router.put('/update/:requestId', [
    body('status').isIn(['processing', 'completed', 'failed', 'cancelled']).withMessage('Invalid status'),
    body('response').optional().isString(),
    body('tokens').optional().isObject(),
    body('cost').optional().isNumeric(),
    body('error').optional().isObject()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation Error',
                details: errors.array()
            });
        }

        const { requestId } = req.params;
        const {
            status,
            response,
            tokens,
            cost,
            error
        } = req.body;

        const aiRequest = await AIRequest.findOne({ 
            requestId,
            userId: req.user.id 
        });

        if (!aiRequest) {
            return res.status(404).json({
                error: 'Request not found',
                message: 'AI request not found or access denied'
            });
        }

        // Update request
        aiRequest.status = status;
        if (response) aiRequest.response = response;
        if (tokens) aiRequest.tokens = tokens;
        if (cost) aiRequest.cost = cost;
        if (error) aiRequest.error = error;

        // Calculate performance metrics
        if (status === 'completed' || status === 'failed') {
            aiRequest.performance.endTime = new Date();
            aiRequest.performance.duration = aiRequest.performance.endTime - aiRequest.performance.startTime;
        }

        await aiRequest.save();

        // Update Prometheus metrics
        updateAIMetrics.incrementRequest(aiRequest.model, status, aiRequest.metadata.feature, aiRequest.userPlan);
        
        if (status === 'completed') {
            updateAIMetrics.recordDuration(aiRequest.model, aiRequest.metadata.feature, aiRequest.userPlan, aiRequest.performance.duration);
            if (aiRequest.tokens.input) {
                updateAIMetrics.incrementTokens(aiRequest.model, 'input', aiRequest.userPlan, aiRequest.tokens.input);
            }
            if (aiRequest.tokens.output) {
                updateAIMetrics.incrementTokens(aiRequest.model, 'output', aiRequest.userPlan, aiRequest.tokens.output);
            }
            if (aiRequest.cost) {
                updateAIMetrics.incrementCost(aiRequest.model, aiRequest.userPlan, aiRequest.cost);
            }
        }

        logger.info('AI request updated', {
            requestId,
            status,
            userId: req.user.id
        });

        res.json({
            message: 'AI request updated successfully',
            requestId: aiRequest.requestId,
            status: aiRequest.status
        });
    } catch (error) {
        logger.error('Error updating AI request:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to update AI request'
        });
    }
});

// Get AI request statistics
router.get('/stats', [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('model').optional().isString(),
    query('feature').optional().isString(),
    query('status').optional().isString(),
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

        const filters = {
            userId: req.user.id,
            ...req.query
        };

        const stats = await AIRequest.getStats(filters);

        res.json({
            stats,
            filters: req.query
        });
    } catch (error) {
        logger.error('Error getting AI request stats:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get AI request statistics'
        });
    }
});

// Get AI request history for user
router.get('/history', [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isString(),
    query('model').optional().isString(),
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

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const query = { userId: req.user.id };
        if (req.query.status) query.status = req.query.status;
        if (req.query.model) query.model = req.query.model;
        if (req.query.feature) query['metadata.feature'] = req.query.feature;

        const requests = await AIRequest.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-prompt -response') // Exclude sensitive data
            .lean();

        const total = await AIRequest.countDocuments(query);

        res.json({
            requests,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Error getting AI request history:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get AI request history'
        });
    }
});

// Admin endpoint to get all AI request statistics
router.get('/admin/stats', adminOnly, [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('model').optional().isString(),
    query('feature').optional().isString(),
    query('status').optional().isString(),
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
        const stats = await AIRequest.getStats(filters);

        // Get additional analytics
        const modelDistribution = await AIRequest.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: '$model',
                    count: { $sum: 1 },
                    avgDuration: { $avg: '$performance.duration' },
                    totalCost: { $sum: '$cost' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const featureDistribution = await AIRequest.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: '$metadata.feature',
                    count: { $sum: 1 },
                    avgDuration: { $avg: '$performance.duration' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        res.json({
            stats,
            modelDistribution,
            featureDistribution,
            filters: req.query
        });
    } catch (error) {
        logger.error('Error getting admin AI request stats:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get AI request statistics'
        });
    }
});

module.exports = router; 