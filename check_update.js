const fs = require('fs');
const d = JSON.parse(fs.readFileSync('tradelab-incubation-state.json','utf8'));
console.log('Last update:', d.updatedAt);
console.log('Time ago:', Math.round((Date.now() - new Date(d.updatedAt).getTime())/60000), 'minutes');
console.log('Candidates:', Object.keys(d.candidates||{}).length);
