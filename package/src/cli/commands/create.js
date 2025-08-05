const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const fileUtils = require('../utils/file-utils');

async function createCommand(type, name, options = {}) {
  try {
    const projectPath = process.cwd();
    
    switch (type) {
      case 'task':
        await createTask(projectPath, name);
        break;
      case 'function':
        await createFunction(projectPath, name, options);
        break;
      default:
        logger.error(`Unknown creation type: ${type}`);
        process.exit(1);
    }
  } catch (error) {
    logger.error(`Failed to create ${type}: ${error.message}`);
    process.exit(1);
  }
}

async function createTask(projectPath, taskName) {
  logger.header(`Creating new Graphile Worker task: ${taskName}`);
  
  // Validate task name
  if (!isValidTaskName(taskName)) {
    logger.error('Invalid task name. Use camelCase or kebab-case (e.g., sendEmail, process-payment)');
    process.exit(1);
  }
  
  // Check if worker service exists
  const workerServicePath = path.join(projectPath, 'services/worker-service');
  if (!await fileUtils.fileExists(workerServicePath)) {
    logger.error('Worker service not found. Make sure you initialized the project with --with-worker option.');
    process.exit(1);
  }
  
  // Check if tasks directory exists
  const tasksDir = path.join(workerServicePath, 'src/tasks');
  if (!await fileUtils.fileExists(tasksDir)) {
    logger.error('Tasks directory not found in worker service.');
    process.exit(1);
  }
  
  // Convert task name to different formats
  const camelCaseName = toCamelCase(taskName);
  const pascalCaseName = toPascalCase(taskName);
  const kebabCaseName = toKebabCase(taskName);
  
  // Create task file
  const taskFilePath = path.join(tasksDir, `${camelCaseName}.ts`);
  
  if (await fileUtils.fileExists(taskFilePath)) {
    logger.error(`Task ${camelCaseName} already exists.`);
    process.exit(1);
  }
  
  // Generate task content
  const taskContent = generateTaskContent(camelCaseName, pascalCaseName, kebabCaseName);
  
  logger.startSpinner('Creating task file...');
  await fs.writeFile(taskFilePath, taskContent);
  logger.stopSpinner('Task file created successfully');
  
  // Update index.ts to export the new task
  await updateTaskIndex(tasksDir, camelCaseName);
  
  logger.success(`Task ${camelCaseName} created successfully!`);
  logger.info(`File: services/worker-service/src/tasks/${camelCaseName}.ts`);
  logger.info('');
  logger.info('Usage in your application:');
  logger.info(`  await addJob('${kebabCaseName}', { /* payload */ });`);
  logger.info('');
  logger.info('Next steps:');
  logger.info('1. Implement your task logic in the created file');
  logger.info('2. Add any required dependencies to worker-service/package.json');
  logger.info('3. Rebuild the worker service: docker-compose build worker');
}

function isValidTaskName(name) {
  // Allow camelCase, kebab-case, and reasonable variations
  return /^[a-z][a-zA-Z0-9-_]*$/.test(name);
}

function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

function toPascalCase(str) {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toKebabCase(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

function generateTaskContent(camelCaseName, pascalCaseName, kebabCaseName) {
  return `import { Task } from "graphile-worker";
import { logger } from "../services/logger";

/**
 * ${pascalCaseName} Task
 * 
 * Description: Add your task description here
 * 
 * Payload interface - customize as needed
 */
interface ${pascalCaseName}Payload {
  // Add your payload properties here
  // Example:
  // userId: string;
  // data: any;
}

/**
 * ${pascalCaseName} task implementation
 * 
 * @param payload - The task payload
 * @param helpers - Graphile Worker helpers (logger, query, etc.)
 */
const ${camelCaseName}: Task = async (payload, helpers) => {
  const { job } = helpers;
  const typedPayload = payload as ${pascalCaseName}Payload;
  
  logger.info(\`Starting ${camelCaseName} task for job \${job.id}\`);
  
  try {
    // TODO: Implement your task logic here
    // Example:
    // await processData(typedPayload.data);
    // await notifyUser(typedPayload.userId);
    
    logger.info(\`Completed ${camelCaseName} task for job \${job.id}\`);
    
    // Optionally return data that will be stored as job output
    return {
      success: true,
      processedAt: new Date().toISOString(),
      // Add any relevant output data
    };
  } catch (error) {
    logger.error(\`Error in ${camelCaseName} task for job \${job.id}:\`, error);
    throw error; // Re-throw to mark job as failed
  }
};

export default ${camelCaseName};
`;
}

async function updateTaskIndex(tasksDir, taskName) {
  const indexPath = path.join(tasksDir, 'index.ts');
  
  let indexContent;
  if (await fileUtils.fileExists(indexPath)) {
    indexContent = await fs.readFile(indexPath, 'utf8');
  } else {
    indexContent = '// Task exports\n';
  }
  
  // Add export for new task
  const exportLine = `export { default as ${taskName} } from './${taskName}';`;
  
  if (!indexContent.includes(exportLine)) {
    indexContent += exportLine + '\n';
    await fs.writeFile(indexPath, indexContent);
    logger.info('Updated task index file');
  }
}

async function createFunction(projectPath, functionName, options) {
  logger.header(`Creating new serverless function: ${functionName}`);
  
  // Validate function name
  if (!isValidFunctionName(functionName)) {
    logger.error('Invalid function name. Use camelCase or kebab-case (e.g., userProfile, get-user-data)');
    process.exit(1);
  }
  
  // Check if functions service exists
  const functionsServicePath = path.join(projectPath, 'services/functions');
  if (!await fileUtils.fileExists(functionsServicePath)) {
    logger.error('Functions service not found. Make sure you initialized the project with --with-functions option.');
    process.exit(1);
  }
  
  // Convert function name to different formats
  const kebabCaseName = toKebabCase(functionName);
  const camelCaseName = toCamelCase(functionName);
  const pascalCaseName = toPascalCase(functionName);
  
  // Determine file extension
  const isTypeScript = options.typescript || options.ts;
  const fileExtension = isTypeScript ? 'ts' : 'js';
  const functionFilePath = path.join(functionsServicePath, `${kebabCaseName}.${fileExtension}`);
  
  if (await fileUtils.fileExists(functionFilePath)) {
    logger.error(`Function ${kebabCaseName}.${fileExtension} already exists.`);
    process.exit(1);
  }
  
  // Generate function content
  const functionContent = generateFunctionContent(
    functionName, 
    camelCaseName, 
    pascalCaseName, 
    kebabCaseName, 
    isTypeScript
  );
  
  logger.startSpinner('Creating function file...');
  await fs.writeFile(functionFilePath, functionContent);
  logger.stopSpinner('Function file created successfully');
  
  logger.success(`Function ${kebabCaseName} created successfully!`);
  logger.info(`File: services/functions/${kebabCaseName}.${fileExtension}`);
  logger.info(`Endpoint: POST /functions/${kebabCaseName}`);
  logger.info('');
  logger.info('Usage:');
  logger.info(`  curl -X POST http://functions.localhost/${kebabCaseName} \\`);
  logger.info(`    -H "Authorization: Bearer YOUR_JWT_TOKEN" \\`);
  logger.info(`    -H "Content-Type: application/json" \\`);
  logger.info(`    -d '{"data": "your payload"}'`);
  logger.info('');
  logger.info('Next steps:');
  logger.info('1. Implement your function logic in the created file');
  logger.info('2. Add any required dependencies to functions/package.json');
  logger.info('3. Restart the functions service: postkit restart functions');
}

function isValidFunctionName(name) {
  // Allow camelCase, kebab-case, and reasonable variations
  return /^[a-z][a-zA-Z0-9-_]*$/.test(name);
}

function generateFunctionContent(originalName, camelCaseName, pascalCaseName, kebabCaseName, isTypeScript) {
  if (isTypeScript) {
    return generateTypeScriptFunction(originalName, camelCaseName, pascalCaseName, kebabCaseName);
  } else {
    return generateJavaScriptFunction(originalName, camelCaseName, pascalCaseName, kebabCaseName);
  }
}

function generateJavaScriptFunction(originalName, camelCaseName, pascalCaseName, kebabCaseName) {
  return `/**
 * ${pascalCaseName} Function
 * 
 * Description: Add your function description here
 * 
 * Endpoint: POST /${kebabCaseName}
 * Authentication: JWT required
 */

module.exports = async (req, res) => {
  const { body, user, headers } = req;
  
  try {
    // Access the authenticated user
    const userId = user?.sub;
    const userName = user?.preferred_username || 'Anonymous';
    
    // Validate request (customize as needed)
    if (!body) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Request body is required'
      });
    }
    
    // TODO: Implement your function logic here
    // Example:
    // const result = await processData(body.data);
    // const notification = await sendNotification(userId, result);
    
    // Example response
    const response = {
      success: true,
      message: '${pascalCaseName} executed successfully',
      data: {
        userId: userId,
        userName: userName,
        payload: body,
        timestamp: new Date().toISOString()
      }
    };
    
    // Return successful response
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Error in ${camelCaseName} function:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};
`;
}

function generateTypeScriptFunction(originalName, camelCaseName, pascalCaseName, kebabCaseName) {
  return `/**
 * ${pascalCaseName} Function (TypeScript)
 * 
 * Description: Add your function description here  
 * 
 * Endpoint: POST /${kebabCaseName}
 * Authentication: JWT required
 */

interface ${pascalCaseName}RequestBody {
  // Define your request body interface here
  // Example:
  // data?: any;
  // userId?: string;
  // action?: string;
}

interface ${pascalCaseName}Response {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

interface UserClaims {
  sub: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  realm_access?: {
    roles: string[];
  };
}

interface FunctionRequest {
  body: ${pascalCaseName}RequestBody;
  user: UserClaims;
  headers: Record<string, string>;
}

interface FunctionResponse {
  status: (code: number) => FunctionResponse;
  json: (data: ${pascalCaseName}Response) => void;
}

module.exports = async (req: FunctionRequest, res: FunctionResponse) => {
  const { body, user, headers } = req;
  
  try {
    // Validate user authentication
    if (!user?.sub) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Valid JWT token required'
      });
    }
    
    // Validate request body (customize as needed)
    if (!body) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Request body is required'
      });
    }
    
    const userId = user.sub;
    const userName = user.preferred_username || 'Anonymous';
    
    // TODO: Implement your function logic here
    // Example:
    // const result = await processUserData(userId, body.data);
    // const validation = await validateInput(body);
    
    // Example successful response
    const response: ${pascalCaseName}Response = {
      success: true,
      message: '${pascalCaseName} executed successfully',
      data: {
        userId: userId,
        userName: userName,
        payload: body,
        timestamp: new Date().toISOString()
      }
    };
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Error in ${camelCaseName} function:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
`;
}

module.exports = createCommand;