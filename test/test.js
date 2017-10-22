const test = require('ava');

const I18N = require('../lib');

test('returns itself', t => {
  t.true(new I18N() instanceof I18N);
});
