const a = require('./build/Release/addon.node');
(async () => {
  console.log('async sma:', await a.sma([2,4,6,8,10], 3));
  console.log('async ema:', await a.ema([10,20,30,40,50,60,70], 3));
  console.log('async rsi:', await a.rsi(Array.from({length:20}, (_,i)=>i+1), 14));
  console.log('async kelly:', await a.kellyCriterion(0.6, 100, 50));
  console.log('async macd:', JSON.stringify(await a.macd(Array.from({length:30}, (_,i)=>i+1), 12, 26, 9)));
  console.log('async bb:', JSON.stringify(await a.bollinger(Array.from({length:30}, (_,i)=>i+1), 20, 2)));
  console.log('async vol:', (await a.volatility(Array.from({length:25}, (_,i)=>i+1), 20)).slice(-3));
  console.log('async medPrice:', await a.medianPrice([100,200,300], [80,160,240]));
  console.log('async typPrice:', await a.typicalPrice([100,200], [80,160], [90,180]));
  console.log('async bullish:', Array.from(await a.bullishImpulse(Array.from({length:25}, (_,i)=>i+1))));
  console.log('async bearish:', Array.from(await a.bearishImpulse(Array.from({length:25}, (_,i)=>i+1))));
  console.log('async calc number:', await a.calculate({formula:'(Close+Open)/2', params:{Close:[10,20,30], Open:[8,18,28]}, returnType:'number'}));
  console.log('async calc bool:', await a.calculate({formula:'High+Low > Close*2', params:{High:[100,200,300], Low:[10,20,30], Close:[50,60,70]}, returnType:'boolean'}));
  console.log('async calc auto:', await a.calculate({formula:'Volume * Close', params:{Volume:[1000,2000,3000], Close:[50,60,70]}}));
  console.log('ALL ASYNC TESTS PASSED');
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
