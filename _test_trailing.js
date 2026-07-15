var m = require('./tools/tradelab_run_once.js');
console.log('OK - trailing:', m.DEFAULT_PARAMS.trailPct, 'atrFilter:', m.DEFAULT_PARAMS.minAtrPct);
console.log('trailingActivated:', m.DEFAULT_PARAMS.trailingActivated);
console.log('trailActivatePct:', m.DEFAULT_PARAMS.trailActivatePct);
console.log('maxAtrPct:', m.DEFAULT_PARAMS.maxAtrPct);
console.log('All params loaded successfully');
