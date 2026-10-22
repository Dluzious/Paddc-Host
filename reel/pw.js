// Playwright dari node_modules biasa, atau dari instalasi global container cloud Claude Code.
try { module.exports = require('playwright'); } catch (e) { module.exports = require('/opt/node-tools/node_modules/playwright'); }
