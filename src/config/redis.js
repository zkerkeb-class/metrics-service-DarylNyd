const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
    try {
        redisClient = redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            retry_strategy: (options) => {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    logger.error('Redis server refused connection');
                    return new Error('Redis server refused connection');
                }
                if (options.total_retry_time > 1000 * 60 * 60) {
                    logger.error('Redis retry time exhausted');
                    return new Error('Redis retry time exhausted');
                }
                if (options.attempt > 10) {
                    logger.error('Redis max retry attempts reached');
                    return undefined;
                }
                return Math.min(options.attempt * 100, 3000);
            }
        });

        redisClient.on('connect', () => {
            logger.info('Redis client connected');
        });

        redisClient.on('ready', () => {
            logger.info('Redis client ready');
        });

        redisClient.on('error', (err) => {
            logger.error('Redis client error:', err);
        });

        redisClient.on('end', () => {
            logger.warn('Redis client connection ended');
        });

        redisClient.on('reconnecting', () => {
            logger.info('Redis client reconnecting...');
        });

        await redisClient.connect();
        return redisClient;
    } catch (error) {
        logger.error('Error connecting to Redis:', error);
        // Don't exit process, Redis is optional for caching
        return null;
    }
};

const getRedisClient = () => {
    return redisClient;
};

const disconnectRedis = async () => {
    if (redisClient) {
        await redisClient.quit();
        logger.info('Redis client disconnected');
    }
};

module.exports = {
    connectRedis,
    getRedisClient,
    disconnectRedis
}; 