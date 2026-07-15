// Inspect OKX package
const okx = require('okx');
console.log('typeof okx:', typeof okx);
console.log('okx keys:', Object.keys(okx));
if (okx.default) {
  console.log('okx.default keys:', Object.keys(okx.default));
  console.log('typeof RestClient:', typeof okx.default.RestClient);
}
if (okx.RestClient) {
  console.log('typeof okx.RestClient:', typeof okx.RestClient);
}
console.log('okx sample:', JSON.stringify(okx).slice(0, 200));
process.exit(0);
