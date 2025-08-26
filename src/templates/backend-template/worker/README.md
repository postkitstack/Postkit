# Graphile Worker with TypeScript

A complete setup for running TypeScript tasks with the official Graphile Worker Docker image, including development workflows, build processes, and production deployment configurations.

## 🎯 Key Features

- ✅ **TypeScript Support**: Write tasks in TypeScript with full type safety
- ✅ **Official Docker Image**: Uses unmodified `graphile/worker` image  
- ✅ **Hot Reload**: Development mode with automatic TypeScript compilation
- ✅ **Production Ready**: Optimized build process and deployment configs
- ✅ **Type Safety**: Runtime payload validation with TypeScript types
- ✅ **NPM Package Support**: Multiple approaches for additional dependencies
- ✅ **VS Code Integration**: Complete IDE setup with IntelliSense and debugging

## 📁 Project Structure

```
├── src/
│   ├── tasks/           # TypeScript task source files
│   │   ├── hello.ts     # Simple task example
│   │   ├── emailTask.ts # Complex task with external APIs
│   │   └── dataProcessing.ts # Advanced batch processing task
│   └── types/
│       └── worker.ts    # Shared TypeScript definitions
├── tasks/               # Compiled JavaScript tasks (auto-generated)
├── scripts/
│   └── build.sh         # Build script for compilation
├── docs/
│   ├── npm-packages.md  # NPM package handling strategies
│   └── typescript-best-practices.md # Development best practices
├── .vscode/             # VS Code configuration  
├── docker-compose.yml   # Worker setup
├── package.json         # Build dependencies
├── tsconfig.json        # TypeScript configuration
└── graphile.config.js   # Graphile Worker configuration
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables
```bash
# Copy and configure environment
cp .env.example .env
# Edit DATABASE_URL in .env
```

### 3. Build TypeScript Tasks
```bash
# One-time build
npm run build

# Or watch mode for development
npm run build:watch
```

### 4. Start Worker
```bash
# Start the worker
docker-compose up
```

## 💻 Development Workflow

### TypeScript Task Development

1. **Write tasks in `src/tasks/`**:
```typescript
// src/tasks/myTask.ts
interface MyTaskPayload {
  userId: string;
  message: string;
}

function isMyTaskPayload(payload: any): payload is MyTaskPayload {
  return typeof payload === 'object' && 
         typeof payload.userId === 'string' &&
         typeof payload.message === 'string';
}

const myTask = async (payload: MyTaskPayload, helpers: TaskHelpers) => {
  const { job, logger } = helpers;
  
  logger.info(`Processing task for user ${payload.userId}`);
  
  // Task logic here
  
  return { success: true, message: 'Task completed' };
};

export = myTask;
```

2. **Build and test**:
```bash
# Build tasks
npm run build

# Restart worker to load changes
docker-compose restart
```

3. **Trigger tasks**:
```bash
# Add job to queue
docker exec graphile-worker node -e "
const { Pool } = require('pg');
async function addJob() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('SELECT graphile_worker.add_job(\$1, \$2::json)', 
    ['myTask', JSON.stringify({ userId: 'user123', message: 'Hello World' })]);
  await pool.end();
}
addJob();
"
```

### VS Code Integration

The project includes complete VS Code setup:

- **Tasks**: Build, watch, clean via `Ctrl+Shift+P` → "Tasks: Run Task"
- **IntelliSense**: Full TypeScript support with auto-imports
- **Debugging**: Set breakpoints in TypeScript source files
- **Formatting**: Automatic code formatting on save

### Build Scripts

```bash
# Available commands
npm run build          # Compile TypeScript to JavaScript
npm run build:watch    # Watch mode compilation
npm run clean          # Clean build artifacts
npm run type-check     # Type checking without emit
npm run dev            # Clean + watch mode

# Manual build script
./scripts/build.sh     # Complete build with logging
```

## 🏗️ Architecture

### How It Works

1. **Development**: Write TypeScript tasks in `src/tasks/`
2. **Compilation**: TypeScript compiles to JavaScript in `tasks/`
3. **Docker Mount**: `tasks/` directory is mounted to worker container
4. **Execution**: Worker loads and executes compiled JavaScript tasks

### TypeScript Compatibility

Since the official Docker image doesn't include TypeScript runtime support, we use a compilation approach:

- ✅ **Development**: Full TypeScript with type checking and IntelliSense
- ✅ **Production**: Compiled JavaScript for maximum compatibility
- ✅ **Type Safety**: Runtime payload validation with TypeScript interfaces

## 📦 Handling NPM Packages

The project supports three approaches for additional NPM packages:

### 1. Custom Docker Image (Recommended)
```dockerfile
FROM graphile/worker:latest
WORKDIR /worker
COPY package.json ./
RUN npm install
COPY tasks/ ./tasks/
```

### 2. Init Container Pattern
```yaml
services:
  package-installer:
    image: node:18-alpine
    volumes:
      - worker-modules:/worker/node_modules
    command: npm install axios lodash

  graphile-worker:
    depends_on: [package-installer]
    volumes:
      - worker-modules:/worker/node_modules
```

### 3. Local Bundling
```bash
# Install and copy to tasks directory
npm install axios
cp -r node_modules/axios tasks/
```

See [`docs/npm-packages.md`](docs/npm-packages.md) for detailed implementation guides.

## 🏭 Production Deployment

### Production Build
```bash
# Clean build for production
npm run clean
npm run build

# Verify compiled tasks
ls -la tasks/

# Start worker
docker-compose up -d
```

### Environment Configuration
```bash
# Environment variables
DATABASE_URL=postgres://user:pass@host:5432/db
```

## 🔧 Configuration

### TypeScript Configuration
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "outDir": "./tasks",
    "rootDir": "./src",
    "strict": true
  }
}
```

### Graphile Worker Configuration
```javascript
// graphile.config.js
module.exports = {
  extends: [WorkerPreset],
  worker: {
    connectionString: process.env.DATABASE_URL,
    concurrentJobs: 5,
    fileExtensions: [".js"]  // Only JS files in production
  }
};
```

## 📊 Example Tasks

### Simple Task
```typescript
const helloTask = async (payload: { message?: string }, helpers: TaskHelpers) => {
  helpers.logger.info(`Hello: ${payload.message || 'World'}`);
  return { success: true };
};
```

### Complex Task with Validation
```typescript
interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  priority?: 'low' | 'normal' | 'high';
}

const emailTask = async (payload: EmailPayload, helpers: TaskHelpers) => {
  // Payload validation
  assertPayload(payload, isEmailPayload);
  
  // Send email
  const result = await emailService.send(payload);
  
  return { success: true, messageId: result.id };
};
```

### Batch Processing Task
```typescript
const batchTask = async (payload: BatchPayload, helpers: TaskHelpers) => {
  const { data, batchSize } = payload;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await processBatch(batch);
    helpers.logger.info(`Processed batch ${i / batchSize + 1}`);
  }
};
```

## 🐛 Troubleshooting

### Common Issues

**TypeScript compilation errors:**
```bash
# Check TypeScript configuration
npm run type-check

# Clean and rebuild
npm run clean && npm run build
```

**Tasks not loading:**
```bash
# Check compiled files exist
ls -la tasks/

# Verify worker logs
docker logs graphile-worker --tail=20
```

**Database connection issues:**
```bash
# Test database connection
docker exec graphile-worker node -e "
const { Pool } = require('pg');
new Pool({ connectionString: process.env.DATABASE_URL })
  .query('SELECT 1').then(() => console.log('DB OK'))
"
```

**NPM package not found:**
- Check if package is installed in worker container
- Verify package is copied to correct location
- Consider using custom Docker image approach

### Debug Mode

```bash
# Enable debug logging
docker-compose -f docker-compose.dev.yml up -d
docker logs graphile-worker -f

# Interactive debugging
docker exec -it graphile-worker node
> require('./tasks/myTask')
```

## 📚 Best Practices

1. **Always validate payloads** with runtime type checking
2. **Use structured logging** with contextual information
3. **Handle errors gracefully** with appropriate retry logic
4. **Test tasks independently** before deployment
5. **Monitor task performance** and resource usage
6. **Use batch processing** for large datasets
7. **Clean up resources** to prevent memory leaks

See [`docs/typescript-best-practices.md`](docs/typescript-best-practices.md) for comprehensive guidelines.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Write TypeScript tasks following the established patterns
4. Test your changes: `npm run build && npm test`
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Documentation**: See `docs/` directory for detailed guides
- **Issues**: Report bugs and feature requests via GitHub issues
- **Discussions**: Use GitHub Discussions for questions and ideas

---

**Ready to build type-safe background jobs with Graphile Worker and TypeScript!** 🚀