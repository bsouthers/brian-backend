// C:\Apps\Brian\src\config\logger.js
const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';

const loggerOptions = {
  level: isProduction ? 'info' : 'debug',
};

// Enable pretty printing only in development
if (!isProduction) {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard', // More readable timestamp
      ignore: 'pid,hostname', // Optional: Hide pid and hostname
    },
  };
}

const logger = pino(loggerOptions);

module.exports = logger;