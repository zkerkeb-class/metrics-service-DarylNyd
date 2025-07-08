const mongoose = require('mongoose');

const aiRequestSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    requestId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    model: {
        type: String,
        required: true,
        enum: ['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'gemini-pro', 'custom'],
        index: true
    },
    prompt: {
        type: String,
        required: true,
        maxlength: 10000
    },
    response: {
        type: String,
        maxlength: 50000
    },
    tokens: {
        input: {
            type: Number,
            default: 0
        },
        output: {
            type: Number,
            default: 0
        },
        total: {
            type: Number,
            default: 0
        }
    },
    cost: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'pending',
        index: true
    },
    error: {
        code: String,
        message: String,
        details: mongoose.Schema.Types.Mixed
    },
    metadata: {
        userAgent: String,
        ipAddress: String,
        sessionId: String,
        feature: {
            type: String,
            enum: ['artwork-analysis', 'style-recommendation', 'market-analysis', 'portfolio-review', 'other'],
            default: 'other'
        },
        complexity: {
            type: String,
            enum: ['simple', 'medium', 'complex'],
            default: 'medium'
        },
        language: {
            type: String,
            default: 'en'
        }
    },
    performance: {
        startTime: Date,
        endTime: Date,
        duration: Number, // in milliseconds
        queueTime: Number, // time spent in queue
        processingTime: Number // actual processing time
    },
    userPlan: {
        type: String,
        enum: ['free', 'basic', 'premium'],
        default: 'free',
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
aiRequestSchema.index({ userId: 1, createdAt: -1 });
aiRequestSchema.index({ status: 1, createdAt: -1 });
aiRequestSchema.index({ model: 1, createdAt: -1 });
aiRequestSchema.index({ 'metadata.feature': 1, createdAt: -1 });
aiRequestSchema.index({ userPlan: 1, createdAt: -1 });

// TTL index to automatically delete old records
aiRequestSchema.index({ createdAt: 1 }, { 
    expireAfterSeconds: parseInt(process.env.METRICS_RETENTION_DAYS || 90) * 24 * 60 * 60 
});

// Pre-save middleware to calculate total tokens
aiRequestSchema.pre('save', function(next) {
    this.tokens.total = (this.tokens.input || 0) + (this.tokens.output || 0);
    this.updatedAt = new Date();
    next();
});

// Static method to get request statistics
aiRequestSchema.statics.getStats = async function(filters = {}) {
    const matchStage = {};
    
    if (filters.userId) matchStage.userId = filters.userId;
    if (filters.status) matchStage.status = filters.status;
    if (filters.model) matchStage.model = filters.model;
    if (filters.userPlan) matchStage.userPlan = filters.userPlan;
    if (filters.feature) matchStage['metadata.feature'] = filters.feature;
    
    if (filters.startDate || filters.endDate) {
        matchStage.createdAt = {};
        if (filters.startDate) matchStage.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) matchStage.createdAt.$lte = new Date(filters.endDate);
    }

    const stats = await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalRequests: { $sum: 1 },
                totalTokens: { $sum: '$tokens.total' },
                totalCost: { $sum: '$cost' },
                avgDuration: { $avg: '$performance.duration' },
                successCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                },
                failureCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                }
            }
        }
    ]);

    return stats[0] || {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        avgDuration: 0,
        successCount: 0,
        failureCount: 0
    };
};

module.exports = mongoose.model('AIRequest', aiRequestSchema); 