const { Worker, isMainThread } = require('worker_threads');
if (isMainThread) {
  new Worker(__filename);
} else {
  const cfm = require('../dist/index.js');
  console.log('worker ok:', JSON.stringify(cfm.smaSync([1, 2, 3, 4], 2)));
}
