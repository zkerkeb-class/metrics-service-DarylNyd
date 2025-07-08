const mongoose = require('mongoose');

const performanceMetricsSchema = new mongoose.Schema({
    service: {
        type: String,
        required: true,
        enum: ['auth', 'database', 'payment', 'metrics', 'frontend', 'ai-service'],
        index: true
    },
    endpoint: {
        type: String,
        required: true,
        index: true
    },
    method: {
        type: String,
        required: true,
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    requestId: {
        type: String,
        required: true,
        unique: true
    },
    statusCode: {
        type: Number,
        required: true,
        index: true
    },
    responseTime: {
        type: Number,
        required: true, // in milliseconds
        index: true
    },
    requestSize: {
        type: Number,
        default: 0 // in bytes
    },
    responseSize: {
        type: Number,
        default: 0 // in bytes
    },
    error: {
        type: String,
        default: null
    },
    metadata: {
        userAgent: String,
        ipAddress: String,
        userPlan: {
            type: String,
            enum: ['free', 'basic', 'premium'],
            default: 'free'
        },
        region: String,
        timezone: String,
        browser: String,
        os: String,
        deviceType: {
            type: String,
            enum: ['desktop', 'mobile', 'tablet'],
            default: 'desktop'
        }
    },
    system: {
        cpu: {
            usage: Number, // percentage
            load: Number
        },
        memory: {
            used: Number, // in MB
            total: Number, // in MB
            percentage: Number
        },
        disk: {
            used: Number, // in GB
            total: Number, // in GB
            percentage: Number
        },
        network: {
            bytesIn: Number,
            bytesOut: Number,
            connections: Number
        }
    },
    database: {
        queryTime: Number, // in milliseconds
        queryCount: Number,
        connectionPool: {
            active: Number,
            idle: Number,
            total: Number
        }
    },
    cache: {
        hits: Number,
        misses: Number,
        hitRate: Number // percentage
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
performanceMetricsSchema.index({ service: 1, timestamp: -1 });
performanceMetricsSchema.index({ endpoint: 1, timestamp: -1 });
performanceMetricsSchema.index({ statusCode: 1, timestamp: -1 });
performanceMetricsSchema.index({ responseTime: 1, timestamp: -1 });
performanceMetricsSchema.index({ userId: 1, timestamp: -1 });

// TTL index to automatically delete old records
performanceMetricsSchema.index({ timestamp: 1 }, { 
    expireAfterSeconds: parseInt(process.env.PERFORMANCE_RETENTION_DAYS || 30) * 24 * 60 * 60 
});

// Static method to get performance statistics
performanceMetricsSchema.statics.getPerformanceStats = async function(filters = {}) {
    const matchStage = {};
    
    if (filters.service) matchStage.service = filters.service;
    if (filters.endpoint) matchStage.endpoint = filters.endpoint;
    if (filters.method) matchStage.method = filters.method;
    if (filters.statusCode) matchStage.statusCode = filters.statusCode;
    if (filters.userId) matchStage.userId = filters.userId;
    
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
                totalRequests: { $sum: 1 },
                avgResponseTime: { $avg: '$responseTime' },
                minResponseTime: { $min: '$responseTime' },
                maxResponseTime: { $max: '$responseTime' },
                p95ResponseTime: { $percentile: { input: '$responseTime', p: 95 } },
                p99ResponseTime: { $percentile: { input: '$responseTime', p: 99 } },
                successCount: {
                    $sum: { $cond: [{ $lt: ['$statusCode', 400] }, 1, 0] }
                },
                errorCount: {
                    $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
                },
                totalRequestSize: { $sum: '$requestSize' },
                totalResponseSize: { $sum: '$responseSize' },
                avgCpuUsage: { $avg: '$system.cpu.usage' },
                avgMemoryUsage: { $avg: '$system.memory.percentage' },
                avgDiskUsage: { $avg: '$system.disk.percentage' }
            }
        }
    ]);

    return stats[0] || {
        totalRequests: 0,
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        successCount: 0,
        errorCount: 0,
        totalRequestSize: 0,
        totalResponseSize: 0,
        avgCpuUsage: 0,
        avgMemoryUsage: 0,
        avgDiskUsage: 0
    };
};

// Static method to get slowest endpoints
performanceMetricsSchema.statics.getSlowestEndpoints = async function(filters = {}, limit = 10) {
    const matchStage = {};
    
    if (filters.service) matchStage.service = filters.service;
    if (filters.startDate || filters.endDate) {
        matchStage.timestamp = {};
        if (filters.startDate) matchStage.timestamp.$gte = new Date(filters.startDate);
        if (filters.endDate) matchStage.timestamp.$lte = new Date(filters.endDate);
    }

    return await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: {
                    service: '$service',
                    endpoint: '$endpoint',
                    method: '$method'
                },
                avgResponseTime: { $avg: '$responseTime' },
                requestCount: { $sum: 1 },
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
                avgResponseTime: 1,
                requestCount: 1,
                errorCount: 1,
                errorRate: {
                    $multiply: [
                        { $divide: ['$errorCount', '$requestCount'] },
                        100
                    ]
                }
            }
        },
        { $sort: { avgResponseTime: -1 } },
        { $limit: limit }
    ]);
};

// Static method to get error rates by endpoint
performanceMetricsSchema.statics.getErrorRates = async function(filters = {}) {
    const matchStage = {};
    
    if (filters.service) matchStage.service = filters.service;
    if (filters.startDate || filters.endDate) {
        matchStage.timestamp = {};
        if (filters.startDate) matchStage.timestamp.$gte = new Date(filters.startDate);
        if (filters.endDate) matchStage.timestamp.$lte = new Date(filters.endDate);
    }

    return await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: {
                    service: '$service',
                    endpoint: '$endpoint',
                    method: '$method',
                    statusCode: '$statusCode'
                },
                count: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: {
                    service: '$_id.service',
                    endpoint: '$_id.endpoint',
                    method: '$_id.method'
                },
                totalRequests: { $sum: '$count' },
                errors: {
                    $push: {
                        statusCode: '$_id.statusCode',
                        count: '$count'
                    }
                }
            }
        },
        {
            $project: {
                service: '$_id.service',
                endpoint: '$_id.endpoint',
                method: '$_id.method',
                totalRequests: 1,
                errors: 1,
                errorRate: {
                    $multiply: [
                        {
                            $divide: [
                                {
                                    $sum: {
                                        $map: {
                                            input: {
                                                $filter: {
                                                    input: '$errors',
                                                    cond: { $gte: ['$$this.statusCode', 400] }
                                                }
                                            },
                                            as: 'error',
                                            in: '$$error.count'
                                        }
                                    }
                                },
                                '$totalRequests'
                            ]
                        },
                        100
                    ]
                }
            }
        },
        { $sort: { errorRate: -1 } }
    ]);
};

// Static method to get system resource usage
performanceMetricsSchema.statics.getSystemResources = async function(filters = {}) {
    const matchStage = {};
    
    if (filters.service) matchStage.service = filters.service;
    if (filters.startDate || filters.endDate) {
        matchStage.timestamp = {};
        if (filters.startDate) matchStage.timestamp.$gte = new Date(filters.startDate);
        if (filters.endDate) matchStage.timestamp.$lte = new Date(filters.endDate);
    }

    return await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: '%Y-%m-%d %H:00:00',
                        date: '$timestamp'
                    }
                },
                avgCpuUsage: { $avg: '$system.cpu.usage' },
                avgMemoryUsage: { $avg: '$system.memory.percentage' },
                avgDiskUsage: { $avg: '$system.disk.percentage' },
                maxCpuUsage: { $max: '$system.cpu.usage' },
                maxMemoryUsage: { $max: '$system.memory.percentage' },
                maxDiskUsage: { $max: '$system.disk.percentage' }
            }
        },
        { $sort: { _id: 1 } }
    ]);
};

module.exports = mongoose.model('PerformanceMetrics', performanceMetricsSchema); 