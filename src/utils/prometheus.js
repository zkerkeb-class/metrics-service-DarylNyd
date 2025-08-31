const promClient = require('prom-client');
const logger = require('./logger');

// Create a Registry to register metrics
const register = promClient.register;

// Prevent duplicate metric registration in development (e.g., with nodemon)
if (process.env.NODE_ENV !== 'production') {
    register.clear();
}

// Enable default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics for AI requests
const aiRequestCounter = new promClient.Counter({
    name: 'ai_requests_total',
    help: 'Total number of AI requests',
    labelNames: ['model', 'status', 'feature', 'user_plan']
});

const aiRequestDuration = new promClient.Histogram({
    name: 'ai_request_duration_seconds',
    help: 'Duration of AI requests in seconds',
    labelNames: ['model', 'feature', 'user_plan'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
});

const aiRequestTokens = new promClient.Counter({
    name: 'ai_request_tokens_total',
    help: 'Total tokens used in AI requests',
    labelNames: ['model', 'type', 'user_plan']
});

const aiRequestCost = new promClient.Counter({
    name: 'ai_request_cost_total',
    help: 'Total cost of AI requests',
    labelNames: ['model', 'user_plan']
});

// Custom metrics for user engagement
const userEngagementCounter = new promClient.Counter({
    name: 'user_engagement_events_total',
    help: 'Total number of user engagement events',
    labelNames: ['event', 'feature', 'user_plan', 'device_type']
});

const activeUsersGauge = new promClient.Gauge({
    name: 'active_users_current',
    help: 'Current number of active users',
    labelNames: ['user_plan']
});

const sessionDuration = new promClient.Histogram({
    name: 'user_session_duration_seconds',
    help: 'Duration of user sessions in seconds',
    labelNames: ['user_plan'],
    buckets: [60, 300, 900, 1800, 3600, 7200, 14400, 28800]
});

// Custom metrics for sales analytics
const salesTransactionCounter = new promClient.Counter({
    name: 'sales_transactions_total',
    help: 'Total number of sales transactions',
    labelNames: ['type', 'status', 'plan', 'payment_method']
});

const salesRevenue = new promClient.Counter({
    name: 'sales_revenue_total',
    help: 'Total revenue from sales',
    labelNames: ['type', 'plan', 'currency']
});

const subscriptionMetrics = new promClient.Gauge({
    name: 'subscriptions_current',
    help: 'Current number of active subscriptions',
    labelNames: ['plan', 'status']
});

// Custom metrics for performance monitoring
const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['service', 'endpoint', 'method', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
});

const httpRequestTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['service', 'endpoint', 'method', 'status_code']
});

const systemCpuUsage = new promClient.Gauge({
    name: 'system_cpu_usage_percentage',
    help: 'CPU usage percentage',
    labelNames: ['service']
});

const systemMemoryUsage = new promClient.Gauge({
    name: 'system_memory_usage_percentage',
    help: 'Memory usage percentage',
    labelNames: ['service']
});

const systemDiskUsage = new promClient.Gauge({
    name: 'system_disk_usage_percentage',
    help: 'Disk usage percentage',
    labelNames: ['service']
});

const databaseConnectionPool = new promClient.Gauge({
    name: 'database_connection_pool',
    help: 'Database connection pool status',
    labelNames: ['service', 'state']
});

const cacheHitRate = new promClient.Gauge({
    name: 'cache_hit_rate_percentage',
    help: 'Cache hit rate percentage',
    labelNames: ['service', 'cache_type']
});

// Register all metrics
register.registerMetric(aiRequestCounter);
register.registerMetric(aiRequestDuration);
register.registerMetric(aiRequestTokens);
register.registerMetric(aiRequestCost);
register.registerMetric(userEngagementCounter);
register.registerMetric(activeUsersGauge);
register.registerMetric(sessionDuration);
register.registerMetric(salesTransactionCounter);
register.registerMetric(salesRevenue);
register.registerMetric(subscriptionMetrics);
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(systemCpuUsage);
register.registerMetric(systemMemoryUsage);
register.registerMetric(systemDiskUsage);
register.registerMetric(databaseConnectionPool);
register.registerMetric(cacheHitRate);

// Helper functions to update metrics
const updateAIMetrics = {
    incrementRequest: (model, status, feature, userPlan) => {
        aiRequestCounter.inc({ model, status, feature, user_plan: userPlan });
    },
    
    recordDuration: (model, feature, userPlan, duration) => {
        aiRequestDuration.observe({ model, feature, user_plan: userPlan }, duration / 1000);
    },
    
    incrementTokens: (model, type, userPlan, count) => {
        aiRequestTokens.inc({ model, type, user_plan: userPlan }, count);
    },
    
    incrementCost: (model, userPlan, cost) => {
        aiRequestCost.inc({ model, user_plan: userPlan }, cost);
    }
};

const updateEngagementMetrics = {
    incrementEvent: (event, feature, userPlan, deviceType) => {
        userEngagementCounter.inc({ 
            event, 
            feature: feature || 'none', 
            user_plan: userPlan, 
            device_type: deviceType || 'unknown' 
        });
    },
    
    setActiveUsers: (userPlan, count) => {
        activeUsersGauge.set({ user_plan: userPlan }, count);
    },
    
    recordSessionDuration: (userPlan, duration) => {
        sessionDuration.observe({ user_plan: userPlan }, duration);
    }
};

const updateSalesMetrics = {
    incrementTransaction: (type, status, plan, paymentMethod) => {
        salesTransactionCounter.inc({ type, status, plan, payment_method: paymentMethod });
    },
    
    incrementRevenue: (type, plan, currency, amount) => {
        salesRevenue.inc({ type, plan, currency }, amount);
    },
    
    setSubscriptions: (plan, status, count) => {
        subscriptionMetrics.set({ plan, status }, count);
    }
};

const updatePerformanceMetrics = {
    recordHttpRequest: (service, endpoint, method, statusCode, duration) => {
        httpRequestTotal.inc({ service, endpoint, method, status_code: statusCode });
        httpRequestDuration.observe({ service, endpoint, method, status_code: statusCode }, duration / 1000);
    },
    
    setSystemMetrics: (service, cpu, memory, disk) => {
        systemCpuUsage.set({ service }, cpu);
        systemMemoryUsage.set({ service }, memory);
        systemDiskUsage.set({ service }, disk);
    },
    
    setDatabaseMetrics: (service, active, idle, total) => {
        databaseConnectionPool.set({ service, state: 'active' }, active);
        databaseConnectionPool.set({ service, state: 'idle' }, idle);
        databaseConnectionPool.set({ service, state: 'total' }, total);
    },
    
    setCacheMetrics: (service, cacheType, hitRate) => {
        cacheHitRate.set({ service, cache_type: cacheType }, hitRate);
    }
};

// Middleware to automatically track HTTP requests
const httpMetricsMiddleware = (req, res, next) => {
    const start = Date.now();
    const service = req.path.split('/')[2] || 'unknown'; // Extract service from path
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        updatePerformanceMetrics.recordHttpRequest(
            service,
            req.path,
            req.method,
            res.statusCode,
            duration
        );
    });
    
    next();
};

// Function to get metrics as text
const getMetrics = async () => {
    try {
        return await register.metrics();
    } catch (error) {
        logger.error('Error generating metrics:', error);
        throw error;
    }
};

module.exports = {
    register,
    updateAIMetrics,
    updateEngagementMetrics,
    updateSalesMetrics,
    updatePerformanceMetrics,
    httpMetricsMiddleware,
    getMetrics
}; 