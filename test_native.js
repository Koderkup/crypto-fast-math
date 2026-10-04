const a = require('./build/Release/addon.node');
console.log('exports:', Object.keys(a).sort().join(', '));

async function main() {
  console.log('smaSync last:', a.smaSync([2,4,6,8,10], 3).slice(-1));
  console.log('sma async last:', (await a.sma([2,4,6,8,10], 3)).slice(-1));
  console.log('rsiSync last:', a.rsiSync(Array.from({length:15}, (_,i)=>i+1), 14).slice(-1));
  console.log('kellySync:', a.kellyCriterionSync(0.6, 100, 50));
  console.log('kelly async:', await a.kellyCriterion(0.6, 100, 50));
  console.log('macd:', JSON.stringify(a.macdSync(Array.from({length:27}, (_,i)=>i+1), 12, 26, 9)));
  console.log('bbands:', JSON.stringify(a.bollingerSync(Array.from({length:30}, (_,i)=>i+1), 20, 2)));
  console.log('vol sync:', a.volatilitySync(Array.from({length:25}, (_,i)=>i+1), 20).slice(-3));
  console.log('medPrice:', a.medianPriceSync([10,20,30], [8,16,24]));
  console.log('typPrice:', a.typicalPriceSync([10,20], [8,16], [9,18]));
  console.log('bullish:', Array.from(a.bullishImpulseSync(Array.from({length:20}, (_,i)=>i+1))));
  console.log('bearish:', Array.from(a.bearishImpulseSync(Array.from({length:20}, (_,i)=>i+1))));
  console.log('--- custom formula ---');
  console.log('calc sync:', a.calculateSync({formula:'(Close+Open)/2', params:{Close:[10,20,30], Open:[8,18,28]}, returnType:'number'}));
  console.log('calc bool sync:', a.calculateSync({formula:'High+Low > Close*2', params:{High:[100,200,300], Low:[10,20,30], Close:[50,60,70]}, returnType:'boolean'}));
  console.log('calc auto:', a.calculateSync({formula:'Volume * Close', params:{Volume:[1000,2000,3000], Close:[50,60,70]}}));
  console.log('calc async:', await a.calculate({formula:'(High+Low)/2', params:{High:[100,200], Low:[80,160]}, returnType:'number'}));
  console.log('hello:', a.hello());
  console.log('ALL TESTS PASSED');
}
main().catch(e => { console.error(e); process.exit(1); });
