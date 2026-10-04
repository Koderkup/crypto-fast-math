const a = require('./build/Release/addon.node');
console.log('1. hello:', a.hello());
console.log('2. kelly:', a.kellyCriterionSync(0.6, 100, 50));
console.log('3. sma:', a.smaSync([2,4,6,8,10], 3));
console.log('4. calculate with constant formula...');
try {
  const r = a.calculateSync({formula:'1+2', params:{x:[1,2,3]}, returnType:'number'});
  console.log('5. const result:', r);
} catch(e) { console.log('5. ERROR:', e.message); }
console.log('6. calculate with (Close+Open)/2...');
try {
  const r = a.calculateSync({formula:'(Close+Open)/2', params:{Close:[10,20,30], Open:[8,18,28]}, returnType:'number'});
  console.log('7. result:', r);
} catch(e) { console.log('7. ERROR:', e.message); }
