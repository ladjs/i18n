const test = require('ava');

const I18N = require('../');

test('returns itself', t => {
  t.true(new I18N() instanceof I18N);
});
