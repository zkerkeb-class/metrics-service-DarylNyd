const mongoose = require('mongoose');

const userEngagementSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    event: {
        type: String,
        required: true,
        enum: [
            'page_view',
            'feature_usage',
            'ai_request',
            'subscription_upgrade',
            'subscription_downgrade',
            'payment_success',
            'payment_failed',
            'login',
            'logout',
            'registration',
            'profile_update',
            'artwork_upload',
            'artwork_analysis',
            'portfolio_view',
            'market_analysis',
            'style_recommendation',
            'search',
            'filter',
            'export',
            'share',
            'feedback',
            'support_request'
        ],
        index: true
    },
    page: {
        type: String,
        required: false
    },
    feature: {
        type: String,
        required: false,
        enum: [
            'artwork-analysis',
            'style-recommendation',
            'market-analysis',
            'portfolio-review',
            'ai-chat',
            'export',
            'share',
            'premium-features'
        ]
    },
    metadata: {
        userAgent: String,
        ipAddress: String,
        referrer: String,
        utmSource: String,
        utmMedium: String,
        utmCampaign: String,
        deviceType: {
            type: String,
            enum: ['desktop', 'mobile', 'tablet'],
            default: 'desktop'
        },
        browser: String,
        os: String,
        screenResolution: String,
        timeOnPage: Number, // in seconds
        scrollDepth: Number, // percentage
        clicks: Number,
        formInteractions: Number
    },
    userPlan: {
        type: String,
        enum: ['free', 'basic', 'premium'],
        default: 'free',
        index: true
    },
    value: {
        type: Number,
        default: 0
    },
    properties: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
userEngagementSchema.index({ userId: 1, timestamp: -1 });
userEngagementSchema.index({ event: 1, timestamp: -1 });
userEngagementSchema.index({ feature: 1, timestamp: -1 });
userEngagementSchema.index({ userPlan: 1, timestamp: -1 });
userEngagementSchema.index({ sessionId: 1, timestamp: -1 });

// TTL index to automatically delete old records
userEngagementSchema.index({ timestamp: 1 }, { 
    expireAfterSeconds: parseInt(process.env.METRICS_RETENTION_DAYS || 90) * 24 * 60 * 60 
});

// Static method to get engagement statistics
userEngagementSchema.statics.getEngagementStats = async function(filters = {}) {
    const matchStage = {};
    
    if (filters.userId) matchStage.userId = filters.userId;
    if (filters.event) matchStage.event = filters.event;
    if (filters.feature) matchStage.feature = filters.feature;
    if (filters.userPlan) matchStage.userPlan = filters.userPlan;
    
    if (filters.startDate || filters.endDate) {
        matchStage.timestamp = {};
        if (filters.startDate) matchStage.timestamp.$gte = new Date(filters.startDate);
        if (filters.endDate) matchStage.timestamp.$lte = new Date(filters.endDate);
    }

    const stats = await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalEvents: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' },
                uniqueSessions: { $addToSet: '$sessionId' },
                totalValue: { $sum: '$value' },
                avgTimeOnPage: { $avg: '$metadata.timeOnPage' },
                avgScrollDepth: { $avg: '$metadata.scrollDepth' }
            }
        },
        {
            $project: {
                totalEvents: 1,
                uniqueUsers: { $size: '$uniqueUsers' },
                uniqueSessions: { $size: '$uniqueSessions' },
                totalValue: 1,
                avgTimeOnPage: 1,
                avgScrollDepth: 1
            }
        }
    ]);

    return stats[0] || {
        totalEvents: 0,
        uniqueUsers: 0,
        uniqueSessions: 0,
        totalValue: 0,
        avgTimeOnPage: 0,
        avgScrollDepth: 0
    };
};

// Static method to get event distribution
userEngagementSchema.statics.getEventDistribution = async function(filters = {}) {
    const matchStage = {};
    
    if (filters.userId) matchStage.userId = filters.userId;
    if (filters.userPlan) matchStage.userPlan = filters.userPlan;
    
    if (filters.startDate || filters.endDate) {
        matchStage.timestamp = {};
        if (filters.startDate) matchStage.timestamp.$gte = new Date(filters.startDate);
        if (filters.endDate) matchStage.timestamp.$lte = new Date(filters.endDate);
    }

    return await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: '$event',
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' }
            }
        },
        {
            $project: {
                event: '$_id',
                count: 1,
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

// Static method to get user journey
userEngagementSchema.statics.getUserJourney = async function(userId, limit = 50) {
    return await this.find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .select('event feature page timestamp metadata')
        .lean();
};

module.exports = mongoose.model('UserEngagement', userEngagementSchema); 