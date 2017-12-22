const { resolve } = require('path');
const test = require('ava');
const request = require('supertest');
const session = require('koa-generic-session');
const sinon = require('sinon');
const Koa = require('koa');
const I18N = require('../lib');

const phrases = { HELLO: 'Hello there!', hello: 'hello' };
const directory = resolve(__dirname, './fixtures');

test('returns itself', t => {
  t.true(new I18N() instanceof I18N);
});

test('throws error with invalid locale', t => {
  const error = t.throws(() => {
    // eslint-disable-next-line no-new
    new I18N({ phrases, locales: ['invalid'], directory });
  }, Error);

  t.is(error.message, 'Invalid locales: invalid');
});

test('translates string', t => {
  const i18n = new I18N({ phrases, directory });

  t.is(i18n.translate('hello', 'en'), 'hello');
  t.is(i18n.translate('hello', 'es'), 'hola');
});

test('translates logs error for non-strings', t => {
  const logger = {
    warn: () => {}
  };
  const spy = sinon.spy(logger, 'warn');
  const i18n = new I18N({ phrases, directory, logger });

  t.is(i18n.translate({}, 'en'), undefined);
  t.true(
    spy.alwaysCalledWithExactly(`translation key missing: [object Object]`)
  );
  t.true(spy.calledOnce);
});

test('returns correct locale from path', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(session());
  app.use(i18n.middleware);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen()).get('/en');

  t.is(res.status, 200);
  t.is(res.body.locale, 'en');
});

test('returns correct locale from cookie', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(session());
  app.use(i18n.middleware);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen())
    .get('/')
    .set('Cookie', ['locale=es']);

  t.is(res.status, 200);
  t.is(res.body.locale, 'es');
});

test('returns correct locale from Accept-Language header', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(session());
  app.use(i18n.middleware);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen())
    .get('/')
    .set('Accept-Language', 'en-US');

  t.is(res.status, 200);
  t.is(res.body.locale, 'en');
});

test('prefers path over cookie', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(session());
  app.use(i18n.middleware);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen())
    .get('/es')
    .set('Cookie', ['locale=en']);

  t.is(res.status, 200);
  t.is(res.body.locale, 'es');
});

test('prefers cookie over Accept-Language header', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(session());
  app.use(i18n.middleware);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen())
    .get('/')
    .set('Cookie', ['locale=es'])
    .set('Accept-Language', 'en-US');

  t.is(res.status, 200);
  t.is(res.body.locale, 'es');
});

test('redirects to correct path based on locale set via cookie', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(session());
  app.use(i18n.middleware);
  app.use(i18n.redirect);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen())
    .get('/')
    .set('Cookie', ['locale=es']);

  t.is(res.status, 302);
  t.is(res.headers.location, '/es/');
});

test(`saves last_locale to user's ctx`, async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(async (ctx, next) => {
    ctx.state.user = {};
    ctx.state.user.save = () => {};
    ctx.isAuthenticated = () => true;
    await next();
  });
  app.use(session());
  app.use(i18n.middleware);
  app.use(i18n.redirect);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen()).get('/en/');

  t.is(res.status, 200);
});

test(`logs error if saves fails for user ctx`, async t => {
  const app = new Koa();
  const saveError = new Error('test error');
  const logger = {
    error: () => {}
  };
  const spy = sinon.spy(logger, 'error');
  const i18n = new I18N({ phrases, directory, logger });

  app.use(async (ctx, next) => {
    ctx.state.user = {};
    ctx.state.user.save = () => {
      throw saveError;
    };
    ctx.isAuthenticated = () => true;
    await next();
  });
  app.use(session());
  app.use(i18n.middleware);
  app.use(i18n.redirect);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen()).get('/en/');

  t.is(res.status, 200);
  t.true(spy.calledOnce);
  t.true(spy.alwaysCalledWithExactly(saveError));
});
