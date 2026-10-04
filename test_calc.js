const a = require('./build/Release/addon.node');
try {
  const r1 = a.calculateSync({formula:'(Close+Open)/2', params:{Close:[10,20,30], Open:[8,18,28]}, returnType:'number'});
  console.log('calc number:', JSON.stringify(r1));
  const r2 = a.calculateSync({formula:'High+Low > Close*2', params:{High:[100,200,300], Low:[10,20,30], Close:[50,60,70]}, returnType:'boolean'});
  console.log('calc bool:', JSON.stringify(r2));
  const r3 = a.calculateSync({formula:'Volume * Close', params:{Volume:[1000,2000,3000], Close:[50,60,70]}});
  console.log('calc auto:', JSON.stringify(r3));
  console.log('ALL CALCULATE TESTS PASSED');
} catch(e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
