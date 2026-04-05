/**
 * Protocolov - Telegram Bot Root Wrapper
 * This script provides compatibility for systems calling 'node telegram-bot.js' from the root.
 */

console.log('📡 [ROOT WRAPPER] Redirecting to src/telegram-bot.js...');
require('./src/telegram-bot.js');
