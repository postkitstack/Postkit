export interface Logger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

class SimpleLogger implements Logger {
  constructor(private context: string) {}

  info(message: string, meta?: any): void {
    console.log(`[${new Date().toISOString()}] INFO [${this.context}]: ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  }

  error(message: string, meta?: any): void {
    console.error(`[${new Date().toISOString()}] ERROR [${this.context}]: ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  }

  warn(message: string, meta?: any): void {
    console.warn(`[${new Date().toISOString()}] WARN [${this.context}]: ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  }

  debug(message: string, meta?: any): void {
    console.debug(`[${new Date().toISOString()}] DEBUG [${this.context}]: ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  }
}

export function createLogger(context: string): Logger {
  return new SimpleLogger(context);
}