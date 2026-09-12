const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/stopSuggestions.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exportsObject = {};
new Function('exports', compiled.outputText)(exportsObject);
const { suggestStops } = exportsObject;
const item = (id, overrides = {}) => ({ id, city: 'sf', hood: 'Mission', category: 'Culture', price: 1, tier: null, ...overrides });
const base = { city: 'sf', used: new Set([1]), anchor: { hood: ' Mission ' }, saved: new Set([3]), category: 'Any', maxPrice: 3 };
let results = suggestStops({ ...base, items: [item(1), item(2), item(3), item(4, { hood: 'Marina' }), item(5, { city: 'nyc' })] });
assert.deepEqual(results.map(r => r.item.id), [3, 2, 4]);
assert.equal(results[0].sameNeighborhood, true);
assert.match(results[0].reason, /want-to-go/);
assert.match(results[2].reason, /Elsewhere/);
results = suggestStops({ ...base, category: 'Outdoors', maxPrice: 0, items: [
  item(2, { category: 'Outdoors', price: 0 }), item(3, { category: 'Outdoors', price: 2 }),
  item(4, { price: 0 }), item(5, { category: 'Outdoors', price: 0, tier: 'okay' }),
] });
assert.deepEqual(results.map(r => r.item.id), [2]);
results = suggestStops({ ...base, saved: new Set(), items: [
  item(1, { category: 'Outdoors', tier: 'loved' }), item(2), item(3, { category: 'Outdoors' }),
] });
assert.equal(results[0].item.id, 3);
assert.match(results[0].reason, /You loved outdoors/);
assert.deepEqual(suggestStops({ ...base, items: [] }), []);
assert.equal(suggestStops({ ...base, anchor: undefined, items: [item(2)] })[0].sameNeighborhood, false);
console.log('Stop suggestions: exclusion, city, neighborhood, saves, taste, category, price, and empty-state checks passed.');
