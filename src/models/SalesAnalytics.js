const mongoose = require('mongoose');

const salesAnalyticsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    transactionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: ['subscription', 'one_time', 'refund', 'credit', 'debit'],
        index: true
    },
    plan: {
        type: String,
        enum: ['free', 'basic', 'premium'],
        default: 'free',
        index: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'USD',
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'],
        default: 'pending',
        index: true
    },
    paymentMethod: {
        type: String,
        enum: ['stripe', 'paypal', 'apple_pay', 'google_pay', 'bank_transfer', 'crypto'],
        index: true
    },
    metadata: {
        stripePaymentIntentId: String,
        paypalOrderId: String,
        invoiceNumber: String,
        description: String,
        tags: [String],
        source: {
            type: String,
            enum: ['web', 'mobile', 'api', 'admin'],
            default: 'web'
        },
        campaign: String,
        utmSource: String,
        utmMedium: String,
        utmCampaign: String,
        referrer: String,
        userAgent: String,
        ipAddress: String
    },
    subscription: {
        startDate: Date,
        endDate: Date,
        interval: {
            type: String,
            enum: ['monthly', 'yearly', 'weekly', 'daily'],
            default: 'monthly'
        },
        autoRenew: {
            type: Boolean,
            default: true
        },
        trialEnd: Date
    },
    refund: {
        amount: Number,
        reason: String,
        processedAt: Date,
        processedBy: mongoose.Schema.Types.ObjectId
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
salesAnalyticsSchema.index({ userId: 1, createdAt: -1 });
salesAnalyticsSchema.index({ status: 1, createdAt: -1 });
salesAnalyticsSchema.index({ type: 1, createdAt: -1 });
salesAnalyticsSchema.index({ plan: 1, createdAt: -1 });
salesAnalyticsSchema.index({ paymentMethod: 1, createdAt: -1 });
salesAnalyticsSchema.index({ currency: 1, createdAt: -1 });

// TTL index to automatically delete old records (keep for longer than other metrics)
salesAnalyticsSchema.index({ createdAt: 1 }, { 
    expireAfterSeconds: parseInt(process.env.SALES_RETENTION_DAYS || 365) * 24 * 60 * 60 
});

// Pre-save middleware
salesAnalyticsSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Static method to get sales statistics
salesAnalyticsSchema.statics.getSalesStats = async function(filters = {}) {
    const matchStage = {};
    
    if (filters.userId) matchStage.userId = filters.userId;
    if (filters.status) matchStage.status = filters.status;
    if (filters.type) matchStage.type = filters.type;
    if (filters.plan) matchStage.plan = filters.plan;
    if (filters.paymentMethod) matchStage.paymentMethod = filters.paymentMethod;
    if (filters.currency) matchStage.currency = filters.currency;
    
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
                totalTransactions: { $sum: 1 },
                totalRevenue: { $sum: '$amount' },
                avgTransactionValue: { $avg: '$amount' },
                successfulTransactions: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                },
                failedTransactions: {
                    $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                },
                refundedTransactions: {
                    $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] }
                },
                totalRefunds: { $sum: '$refund.amount' }
            }
        }
    ]);

    return stats[0] || {
        totalTransactions: 0,
        totalRevenue: 0,
        avgTransactionValue: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        refundedTransactions: 0,
        totalRefunds: 0
    };
};

// Static method to get revenue by plan
salesAnalyticsSchema.statics.getRevenueByPlan = async function(filters = {}) {
    const matchStage = { status: 'completed' };
    
    if (filters.startDate || filters.endDate) {
        matchStage.createdAt = {};
        if (filters.startDate) matchStage.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) matchStage.createdAt.$lte = new Date(filters.endDate);
    }

    return await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: '$plan',
                totalRevenue: { $sum: '$amount' },
                transactionCount: { $sum: 1 },
                avgTransactionValue: { $avg: '$amount' }
            }
        },
        { $sort: { totalRevenue: -1 } }
    ]);
};

// Static method to get monthly recurring revenue (MRR)
salesAnalyticsSchema.statics.getMRR = async function(date = new Date()) {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const mrr = await this.aggregate([
        {
            $match: {
                status: 'completed',
                type: 'subscription',
                createdAt: { $gte: startOfMonth, $lte: endOfMonth }
            }
        },
        {
            $group: {
                _id: null,
                mrr: { $sum: '$amount' },
                subscriptionCount: { $sum: 1 }
            }
        }
    ]);

    return mrr[0] || { mrr: 0, subscriptionCount: 0 };
};

// Static method to get customer lifetime value (CLV)
salesAnalyticsSchema.statics.getCustomerLifetimeValue = async function(userId) {
    const clv = await this.aggregate([
        {
            $match: {
                userId: mongoose.Types.ObjectId(userId),
                status: 'completed'
            }
        },
        {
            $group: {
                _id: '$userId',
                totalSpent: { $sum: '$amount' },
                transactionCount: { $sum: 1 },
                avgOrderValue: { $avg: '$amount' },
                firstPurchase: { $min: '$createdAt' },
                lastPurchase: { $max: '$createdAt' }
            }
        }
    ]);

    return clv[0] || {
        totalSpent: 0,
        transactionCount: 0,
        avgOrderValue: 0,
        firstPurchase: null,
        lastPurchase: null
    };
};

module.exports = mongoose.model('SalesAnalytics', salesAnalyticsSchema); 