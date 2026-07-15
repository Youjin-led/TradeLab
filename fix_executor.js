const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'tools', 'tradelab_live_executor.js');
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Replace RestClient with ccxt.okx
content = content.replace(
  "okxClient = new RestClient({",
  "okxClient = new ccxt.okx({"
);

content = content.replace(
  "apiSecret: secretKey",
  "secret: secretKey"
);

content = content.replace(
  "apiPass: passphrase",
  "password: passphrase"
);

// Fix 2: Replace placeOkxOrder to use ccxt
content = content.replace(
  "async function placeOkxOrder(symbol, side, size, price = null) {",
  "async function placeOkxOrder(symbol, side, size, price = null) {"
);

// Fix 3: Replace closePosition to use ccxt
content = content.replace(
  "async function closePosition(symbol, side, size) {",
  "async function closePosition(symbol, side, size) {"
);

// Fix 4: Replace the order placement section  
content = content.replace(
  "const client = getOkxClient();\n  \n  // Конвертируем символ в формат OKX (BTCUSDT -> BTC-USDT)\n  const okxSymbol = symbol.replace('USDT', '-USDT');\n  \n  // Определяем сторону\n  const orderSide = side === 'LONG' ? 'buy' : 'sell';\n  \n  // Определяем тип ордера\n  const orderType = price ? 'limit' : 'market';\n  \n  // Параметры ордера\n  const orderParams = {\n    instId: okxSymbol,\n    tdMode: CONFIG.tradingMode === 'futures' ? 'cross' : 'cash',\n    side: orderSide,\n    ordType: orderType,\n    sz: String(size)\n  };\n  \n  if (price) {\n    orderParams.px = String(price);\n  }\n\n  console.log(`[OKX] Placing order: ${JSON.stringify(orderParams)}`);\n  \n  try {\n    const result = await client.placeOrder(orderParams);\n    console.log(`[OKX] Order result: ${JSON.stringify(result)}`);\n    return result;\n  } catch (error) {\n    console.error(`[OKX] Order failed: ${error.message}`);\n    throw error;\n  }",
  "const client = getOkxClient();\n  const okxSymbol = symbol.replace('USDT', '/USDT');\n  const orderType = side === 'LONG' ? 'buy' : 'sell';\n  const orderMethod = price ? 'limit' : 'market';\n  console.log(`[OKX] Placing ${orderType} ${orderMethod} order: ${size}x ${okxSymbol}`);\n  try {\n    const result = await client.createOrder(okxSymbol, orderMethod, orderType, size, price);\n    console.log(`[OKX] Order result: ${JSON.stringify(result)}`);\n    return result;\n  } catch (error) {\n    console.error(`[OKX] Order failed: ${error.message}`);\n    throw error;\n  }"
);

// Fix 5: Replace close position to use ccxt
content = content.replace(
  "const client = getOkxClient();\n  const okxSymbol = symbol.replace('USDT', '-USDT');\n  const closeSide = side === 'LONG' ? 'sell' : 'buy';\n  \n  const orderParams = {\n    instId: okxSymbol,\n    tdMode: CONFIG.tradingMode === 'futures' ? 'cross' : 'cash',\n    side: closeSide,\n    ordType: 'market',\n    sz: String(size),\n    reduceOnly: true\n  };\n\n  console.log(`[OKX] Closing position: ${JSON.stringify(orderParams)}`);\n  \n  try {\n    const result = await client.placeOrder(orderParams);\n    console.log(`[OKX] Close result: ${JSON.stringify(result)}`);\n    return result;\n  } catch (error) {\n    console.error(`[OKX] Close failed: ${error.message}`);\n    throw error;\n  }",
  "const client = getOkxClient();\n  const okxSymbol = symbol.replace('USDT', '/USDT');\n  const closeSide = side === 'LONG' ? 'sell' : 'buy';\n  console.log(`[OKX] Closing position: ${closeSide} ${size}x ${okxSymbol}`);\n  try {\n    const result = await client.createOrder(okxSymbol, 'market', closeSide, size);\n    console.log(`[OKX] Close result: ${JSON.stringify(result)}`);\n    return result;\n  } catch (error) {\n    console.error(`[OKX] Close failed: ${error.message}`);\n    throw error;\n  }"
);

// Remove demo mode comments
content = content.replace(
  "    // Используем демо-режим, если ключи не настроены\n    // В продакшене убрать demo: true\n    // demo: true",
  ""
);

fs.writeFileSync(filePath, content);
console.log('Fixed:', filePath);
