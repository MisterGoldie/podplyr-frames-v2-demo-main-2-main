/**
 * Logger utility to centralize and control all console logging in the application
 * 
 * USAGE:
 * import { logger } from '~/utils/logger';
 * 
 * logger.debug('Detailed information', data);
 * logger.info('Something happened');
 * logger.warn('Something might be wrong');
 * logger.error('Something is definitely wrong', error);
 * 
 * // Module-specific logging
 * const nftLogger = logger.getModuleLogger('nft');
 * nftLogger.info('Loading NFT data');
 */

// ENVIRONMENT DETECTION
// In Next.js, process.env.NODE_ENV will be 'production' in production
// and 'development' in development
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// const IS_TEST = process.env.NODE_ENV === 'test'; // Unused variable removed

// CONFIGURATION
// Set this to true to enable logs in production (normally should be false)
const FORCE_LOGS_IN_PRODUCTION = false;

// Master switch to enable/disable all logging - FORCE ENABLE for debugging likes
export let DEBUG_MODE = true; // FORCE ENABLED to debug the like functionality

// Enable specific log levels (can be customized)
const ENABLED_LEVELS = {
  debug: true, // FORCE ENABLED for debugging
  info: true,  // FORCE ENABLED for debugging
  warn: true,  // Warnings always shown
  error: true, // Errors always shown
};

// Enable logs for specific modules (can be customized)
const ENABLED_MODULES: Record<string, boolean> = {
  'nft': true,        // NFT-related logs
  'media': true,      // Media handling logs
  'firebase': true,   // Firebase logs
  'auth': true,       // Authentication logs
  'player': true,     // Audio/video player logs
  'data': true,       // Data loading logs
  'ui': true,         // UI related logs
  'default': true,    // Unspecified module logs
};

// HELPER FUNCTIONS

/**
 * Check if a specific log level is enabled
 */
const isLevelEnabled = (level: 'debug' | 'info' | 'warn' | 'error'): boolean => {
  return ENABLED_LEVELS[level] === true;
};

/**
 * Check if logging is enabled for a specific module
 */
const isModuleEnabled = (module: string): boolean => {
  if (module in ENABLED_MODULES) {
    return ENABLED_MODULES[module];
  }
  return ENABLED_MODULES.default;
};

/**
 * Format timestamp for logs
 */
const getTimestamp = (): string => {
  return new Date().toISOString().split('T')[1].split('.')[0];
};

/**
 * Get appropriate console method based on log level
 */
const getConsoleMethod = (level: 'debug' | 'info' | 'warn' | 'error') => {
  switch (level) {
    case 'debug': return console.debug;
    case 'info': return console.info;
    case 'warn': return console.warn;
    case 'error': return console.error;
    default: return console.log;
  }
};

/**
 * Core logging function
 */
const log = (
  level: 'debug' | 'info' | 'warn' | 'error',
  module: string,
  message: string,
  ...args: any[]
) => {
  // Skip logging if disabled for this level or module
  if (!isLevelEnabled(level) || !isModuleEnabled(module)) {
    return;
  }

  const consoleMethod = getConsoleMethod(level);
  const timestamp = getTimestamp();
  const prefix = `[${timestamp}][${level.toUpperCase()}][${module}]`;

  // Use the appropriate console method with the formatted prefix
  consoleMethod(`${prefix} ${message}`, ...args);
};

/**
 * Function to completely disable all logs - MODIFIED to preserve console methods for debugging
 * CRITICAL: This now only changes the DEBUG_MODE flags but DOES NOT override console methods
 */
const disableAllLogs = () => {
  DEBUG_MODE = false;
  ENABLED_LEVELS.debug = false;
  ENABLED_LEVELS.info = false;
  ENABLED_LEVELS.warn = false;
  ENABLED_LEVELS.error = false;
  
  console.warn('⚠️⚠️⚠️ LOGGER: Logs were disabled via disableAllLogs, but console methods are preserved for debugging');
  
  // NO LONGER overrides console methods to ensure direct console logs continue to work
};

/**
 * Create a logger instance for a specific module
 */
class ModuleLogger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  debug(message: string, ...args: any[]) {
    log('debug', this.module, message, ...args);
  }

  info(message: string, ...args: any[]) {
    log('info', this.module, message, ...args);
  }

  warn(message: string, ...args: any[]) {
    log('warn', this.module, message, ...args);
  }

  error(message: string, ...args: any[]) {
    log('error', this.module, message, ...args);
  }
}

/**
 * Main logger object exported for use throughout the app
 */
export const logger = {
  debug: (message: string, ...args: any[]) => log('debug', 'default', message, ...args),
  info: (message: string, ...args: any[]) => log('info', 'default', message, ...args),
  warn: (message: string, ...args: any[]) => log('warn', 'default', message, ...args),
  error: (message: string, ...args: any[]) => log('error', 'default', message, ...args),
  
  // Create a module-specific logger
  getModuleLogger: (module: string): ModuleLogger => {
    return new ModuleLogger(module);
  },

  // Enable or disable a specific module's logs at runtime
  enableModule: (module: string, enabled: boolean = true) => {
    ENABLED_MODULES[module] = enabled;
  },

  // Enable or disable a specific log level at runtime
  enableLevel: (level: 'debug' | 'info' | 'warn' | 'error', enabled: boolean = true) => {
    ENABLED_LEVELS[level] = enabled;
  },

  // Toggle all logging on or off
  setDebugMode: (enabled: boolean) => {
    // Now we can modify it since it's declared with 'let'
    DEBUG_MODE = enabled;
    
    // Update level settings
    ENABLED_LEVELS.debug = enabled && !IS_PRODUCTION;
    ENABLED_LEVELS.info = enabled;
  },

  // Check current debug mode status
  isDebugMode: () => DEBUG_MODE,
  
  // Function to completely disable all logging (including console)
  disableAllLogs: disableAllLogs
};

// Export a simple debugLog function for backward compatibility
export const debugLog = (...args: any[]) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};

export default logger; 