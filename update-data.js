/**
 * Protocolov - Data Update Wrapper
 * This script provides backward compatibility for systems calling 'node update-data.js'
 * It simply delegates execution to the actual script in 'src/update-data.js'
 */

console.log('--- Initializing Protocolov update-data wrapper ---');
const { run } = require('./src/update-data.js');
run();

