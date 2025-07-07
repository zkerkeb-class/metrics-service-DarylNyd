# Metrics Service - NydArt Advisor

A comprehensive metrics and analytics service for tracking AI requests, user engagement, sales analytics, and performance monitoring using Node.js, Express, MongoDB, Redis, and Prometheus.

## Features

### 🤖 AI Request Tracking
- Track AI model usage (GPT-4, GPT-3.5-turbo, Claude-3, Gemini-Pro)
- Monitor token consumption and costs
- Analyze request performance and success rates
- Feature-based categorization (artwork analysis, style recommendation, etc.)

### 👥 User Engagement Analytics
- Page view and feature usage tracking
- Session duration and user journey analysis
- Device and browser analytics
- UTM campaign tracking
- User behavior patterns

### 💰 Sales Analytics
- Transaction tracking and revenue analysis
- Subscription metrics and MRR calculation
- Customer lifetime value (CLV) analysis
- Payment method distribution
- Refund and churn tracking

### ⚡ Performance Monitoring
- HTTP request/response metrics
- System resource monitoring (CPU, Memory, Disk)
- Database connection pool monitoring
- Cache hit rate tracking
- Error rate analysis and alerting

### 📊 Prometheus Integration
- Custom metrics for all tracking categories
- Real-time monitoring capabilities
- Integration with Grafana for visualization
- Default system metrics collection

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Auth Service  │    │  Payment Service│
│   (Next.js)     │    │   (Port 5002)   │    │  (Port 3004)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Metrics Service│
                    │   (Port 5005)   │
                    └─────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MongoDB       │    │     Redis       │    │   Prometheus    │
│  (Metrics DB)   │    │   (Caching)     │    │   (Port 9090)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB
- Redis (optional, for caching)
- Prometheus (optional, for monitoring)

### Installation

1. **Clone and install dependencies:**
```bash
cd metrics-service-DarylNyd
npm install
```

2. **Set up environment variables:**
```bash
cp env.example .env
# Edit .env with your configuration
```

3. **Start the service:**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

### Environment Variables

```env
# Server Configuration
PORT=5005
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/nydart_metrics
REDIS_URL=redis://localhost:6379

# Service URLs
AUTH_SERVICE_URL=http://localhost:5002
DATABASE_SERVICE_URL=http://localhost:5001
PAYMENT_SERVICE_URL=http://localhost:3004
FRONTEND_URL=http://localhost:3000

# Security
JWT_SECRET=your-jwt-secret-here
API_KEY=your-secret-api-key-here

# Metrics Retention (days)
METRICS_RETENTION_DAYS=90
SALES_RETENTION_DAYS=365
PERFORMANCE_RETENTION_DAYS=30
```

## API Endpoints

### Health Check
```http
GET /health
```

### Prometheus Metrics
```http
GET /metrics
```

### AI Request Tracking

#### Track AI Request
```http
POST /api/ai-tracking/track
Authorization: Bearer <token>
Content-Type: application/json

{
  "requestId": "req_123456789",
  "model": "gpt-4",
  "prompt": "Analyze this artwork...",
  "feature": "artwork-analysis",
  "complexity": "medium",
  "language": "en",
  "userPlan": "premium"
}
```

#### Update AI Request Status
```http
PUT /api/ai-tracking/update/:requestId
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "completed",
  "response": "Analysis result...",
  "tokens": {
    "input": 150,
    "output": 300
  },
  "cost": 0.05
}
```

#### Get AI Request Statistics
```http
GET /api/ai-tracking/stats?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <token>
```

### User Engagement Analytics

#### Track Engagement Event
```http
POST /api/analytics/engagement/track
Authorization: Bearer <token>
Content-Type: application/json

{
  "event": "page_view",
  "sessionId": "sess_123456789",
  "page": "/dashboard",
  "feature": "artwork-analysis",
  "value": 1,
  "properties": {
    "timeOnPage": 120,
    "scrollDepth": 75
  }
}
```

#### Get Engagement Statistics
```http
GET /api/analytics/engagement/stats?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <token>
```

### Sales Analytics

#### Track Sales Transaction
```http
POST /api/analytics/sales/track
Authorization: Bearer <token>
Content-Type: application/json

{
  "transactionId": "txn_123456789",
  "type": "subscription",
  "amount": 29.99,
  "currency": "USD",
  "status": "completed",
  "paymentMethod": "stripe",
  "plan": "premium"
}
```

#### Get Sales Statistics
```http
GET /api/analytics/sales/stats?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <token>
```

### Performance Monitoring

#### Track Performance Metric
```http
POST /api/performance/track
Authorization: Bearer <token>
Content-Type: application/json

{
  "service": "auth",
  "endpoint": "/auth/login",
  "method": "POST",
  "statusCode": 200,
  "responseTime": 150,
  "requestSize": 1024,
  "responseSize": 2048,
  "system": {
    "cpu": { "usage": 45.2 },
    "memory": { "percentage": 67.8 }
  }
}
```

#### Get Performance Statistics
```http
GET /api/performance/stats?service=auth&startDate=2024-01-01
Authorization: Bearer <token>
```

### Dashboard & General Metrics

#### Get Dashboard Overview
```http
GET /api/metrics/dashboard
Authorization: Bearer <token>
```

#### Get Metrics Summary
```http
GET /api/metrics/summary?groupBy=day&startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <token>
```

#### Get Top Metrics
```http
GET /api/metrics/top-metrics?metric=ai-models&limit=10
Authorization: Bearer <token>
```

## Prometheus Metrics

The service exposes the following custom metrics:

### AI Request Metrics
- `ai_requests_total` - Total AI requests by model, status, feature, user plan
- `ai_request_duration_seconds` - Request duration histogram
- `ai_request_tokens_total` - Token usage by model, type, user plan
- `ai_request_cost_total` - Cost tracking by model, user plan

### User Engagement Metrics
- `user_engagement_events_total` - Event counts by type, feature, user plan
- `active_users_current` - Current active users gauge
- `user_session_duration_seconds` - Session duration histogram

### Sales Metrics
- `sales_transactions_total` - Transaction counts by type, status, plan
- `sales_revenue_total` - Revenue tracking by type, plan, currency
- `subscriptions_current` - Current subscription counts

### Performance Metrics
- `http_request_duration_seconds` - HTTP request duration histogram
- `http_requests_total` - HTTP request counts
- `system_cpu_usage_percentage` - CPU usage gauge
- `system_memory_usage_percentage` - Memory usage gauge
- `system_disk_usage_percentage` - Disk usage gauge
- `database_connection_pool` - Database connection pool status
- `cache_hit_rate_percentage` - Cache hit rate gauge

## Grafana Integration

### Prometheus Data Source
1. Add Prometheus as a data source in Grafana
2. URL: `http://localhost:9090`
3. Access: Server (default)

### Sample Dashboards

#### AI Analytics Dashboard
- AI request volume over time
- Model usage distribution
- Cost analysis by model
- Success rate trends
- Feature usage heatmap

#### User Engagement Dashboard
- Active users over time
- Page view trends
- Feature adoption rates
- User journey funnel
- Device/browser analytics

#### Sales Dashboard
- Revenue trends
- Subscription metrics
- Payment method distribution
- Customer lifetime value
- Churn analysis

#### Performance Dashboard
- Response time trends
- Error rate monitoring
- System resource usage
- Database performance
- Cache hit rates

## Data Models

### AIRequest
```javascript
{
  userId: ObjectId,
  requestId: String,
  model: String,
  prompt: String,
  response: String,
  tokens: { input: Number, output: Number, total: Number },
  cost: Number,
  status: String,
  metadata: {
    feature: String,
    complexity: String,
    language: String
  },
  performance: {
    startTime: Date,
    endTime: Date,
    duration: Number
  },
  userPlan: String,
  createdAt: Date
}
```

### UserEngagement
```javascript
{
  userId: ObjectId,
  sessionId: String,
  event: String,
  page: String,
  feature: String,
  metadata: {
    deviceType: String,
    browser: String,
    os: String,
    timeOnPage: Number,
    scrollDepth: Number
  },
  userPlan: String,
  value: Number,
  properties: Object,
  timestamp: Date
}
```

### SalesAnalytics
```javascript
{
  userId: ObjectId,
  transactionId: String,
  type: String,
  amount: Number,
  currency: String,
  status: String,
  paymentMethod: String,
  plan: String,
  subscription: {
    startDate: Date,
    endDate: Date,
    interval: String
  },
  metadata: Object,
  createdAt: Date
}
```

### PerformanceMetrics
```javascript
{
  service: String,
  endpoint: String,
  method: String,
  userId: ObjectId,
  requestId: String,
  statusCode: Number,
  responseTime: Number,
  system: {
    cpu: { usage: Number, load: Number },
    memory: { used: Number, total: Number, percentage: Number },
    disk: { used: Number, total: Number, percentage: Number }
  },
  database: {
    queryTime: Number,
    connectionPool: { active: Number, idle: Number, total: Number }
  },
  cache: { hits: Number, misses: Number, hitRate: Number },
  timestamp: Date
}
```

## Security

### Authentication
- JWT-based authentication
- Integration with auth service
- Role-based access control (admin/user)

### Rate Limiting
- Configurable rate limits per IP
- Default: 100 requests per 15 minutes

### Data Privacy
- User data isolation
- Admin-only access to aggregated metrics
- Automatic data retention policies

## Monitoring & Alerting

### Health Checks
- Service health endpoint
- Database connectivity monitoring
- Redis connectivity monitoring

### Performance Alerts
- High error rate detection
- Slow response time alerts
- System resource thresholds

### Data Retention
- Configurable TTL indexes
- Automatic cleanup of old data
- Different retention periods per metric type

## Development

### Running Tests
```bash
npm test
npm run test:watch
```

### Code Structure
```
src/
├── config/          # Database and Redis configuration
├── middleware/      # Authentication and error handling
├── models/          # MongoDB schemas
├── routes/          # API route handlers
├── utils/           # Utilities and helpers
└── server.js        # Main application file
```

### Logging
- Winston-based logging
- Structured JSON logs
- File and console output
- Log rotation and retention

## Deployment

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5005
CMD ["npm", "start"]
```

### Environment Variables for Production
```env
NODE_ENV=production
PORT=5005
MONGODB_URI=mongodb://your-mongodb-uri
REDIS_URL=redis://your-redis-uri
JWT_SECRET=your-secure-jwt-secret
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

---

**Metrics Service** - Empowering data-driven decisions for NydArt Advisor 