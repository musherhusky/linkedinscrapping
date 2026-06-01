const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  constructor(context = '') {
    this.context = context;
  }

  log(level, message, data = null) {
    if (LEVELS[level] < LEVELS[LOG_LEVEL]) return;

    const timestamp = new Date().toISOString();
    const prefix = this.context ? `[${this.context}]` : '';
    
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      prefix,
      message,
      data,
    };

    const logString = `${timestamp} ${logEntry.level} ${prefix} ${message}`;
    console.log(logString);
    
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  debug(message, data = null) {
    this.log('debug', `🔍 ${message}`, data);
  }

  info(message, data = null) {
    this.log('info', `ℹ️ ${message}`, data);
  }

  success(message, data = null) {
    this.log('info', `✅ ${message}`, data);
  }

  warn(message, data = null) {
    this.log('warn', `⚠️ ${message}`, data);
  }

  error(message, data = null) {
    this.log('error', `❌ ${message}`, data);
  }

  section(title) {
    console.log(`\n${'='.repeat(50)}`);
    this.info(title);
    console.log(`${'='.repeat(50)}\n`);
  }
}

export default new Logger();
