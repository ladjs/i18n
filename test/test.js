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
  const i18n = new I18N({ phrases, directory, logger });

  const error = t.throws(() => i18n.translate('UNKNOWN', 'en'));
  t.is(error.message, 'translation key missing: UNKNOWN');
});

test('ctx.translates throws error for non-strings', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      ctx.status = err.statusCode || err.status || 500;
      ctx.body = {
        message: err.message
      };
    }
  });
  app.use(session());
  app.use(i18n.middleware);
  app.use(ctx => {
    ctx.translate({}, 'en');
  });

  const res = await request(app.listen()).get('/en');

  t.is(res.body.message, 'Translation for your locale failed, try again');
});

test('ctx.state.l converts path to locale', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(session());
  app.use(i18n.middleware);
  app.use(ctx => {
    ctx.state.locale = 'es';
    ctx.body = {
      path: ctx.state.l('/random/path'),
      pathBlank: ctx.state.l()
    };
  });

  const res = await request(app.listen()).get('/en');

  t.is(res.body.path, '/es/random/path');
  t.is(res.body.pathBlank, '/es');
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

test('returns correct locale from user', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(async (ctx, next) => {
    ctx.state.user = {};
    ctx.state.user.save = () => {};
    ctx.state.user.last_locale = 'en';
    ctx.isAuthenticated = () => true;
    ctx.request.acceptsLanguages = () => false;
    await next();
  });
  app.use(session());
  app.use(i18n.middleware);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen()).get('/');

  t.is(res.status, 200);
  t.is(res.body.locale, 'en');
});

test('returns correct locale from default', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(async (ctx, next) => {
    ctx.request.acceptsLanguages = () => false;
    await next();
  });
  app.use(session());
  app.use(i18n.middleware);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen()).get('/');

  t.is(res.status, 200);
  t.is(res.body.locale, 'en');
});

test('redirects if locale is not avaiable', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(async (ctx, next) => {
    ctx.state.user = {};
    ctx.state.user.save = () => {};
    ctx.state.user.last_locale = 'de';
    ctx.isAuthenticated = () => true;
    ctx.request.acceptsLanguages = () => false;
    await next();
  });
  app.use(session());
  app.use(i18n.middleware);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen()).get('/');

  t.is(res.status, 302);
  t.is(res.header.location, '/en/');
});

test('redirects if locale is not avaiable with query', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(async (ctx, next) => {
    ctx.state.user = {};
    ctx.state.user.save = () => {};
    ctx.state.user.last_locale = 'de';
    ctx.isAuthenticated = () => true;
    ctx.request.acceptsLanguages = () => false;
    ctx.query = { a: 'b' };
    await next();
  });
  app.use(session());
  app.use(i18n.middleware);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  const res = await request(app.listen()).get('/');

  t.is(res.status, 302);
  t.is(res.header.location, '/en/??a=b');
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

test('does not redirect with ignored redirect globs', async t => {
  const app = new Koa();
  const i18n = new I18N({
    phrases,
    directory,
    ignoredRedirectGlobs: ['/auth/**/*', '/login']
  });

  app.use(session());
  app.use(i18n.middleware);
  app.use(i18n.redirect);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  let res = await request(app.listen())
    .get('/login')
    .set('Cookie', ['locale=es']);
  t.is(res.status, 200);

  res = await request(app.listen())
    .get('/auth/google/ok')
    .set('Cookie', ['locale=es']);
  t.is(res.status, 200);

  res = await request(app.listen())
    .get('/login/beep/baz')
    .set('Cookie', ['locale=es']);
  t.is(res.status, 302);
  t.is(res.headers.location, '/es/login/beep/baz');
});

// https://github.com/ladjs/lad/issues/372
test('does not duplicate querystring if no locale provided', async t => {
  // https://lad.sh?test=test?test=test?test=test%3Ftest%3Dtest
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

  const res = await request(app.listen()).get(
    '/?test=test?test=test?test=test'
  );

  t.is(res.status, 302);
  t.is(res.headers.location, '/en?test=test%3Ftest%3Dtest%3Ftest%3Dtest');
});

test('redirectIgnoresNonGetMethods', async t => {
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

  let res = await request(app.listen()).get('/');
  t.is(res.status, 302);
  t.is(res.headers.location, '/en');

  res = await request(app.listen()).post('/');
  t.is(res.status, 200);
});

test('ignoredRedirectGlobs', async t => {
  const app = new Koa();
  const i18n = new I18N({
    ignoredRedirectGlobs: ['/foo', '/baz/**/*'],
    phrases,
    directory
  });

  app.use(session());
  app.use(i18n.middleware);
  app.use(i18n.redirect);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = { locale };
    ctx.status = 200;
  });

  let res = await request(app.listen()).get('/foo');
  t.is(res.status, 200);

  res = await request(app.listen()).get('/baz/beep/bar');
  t.is(res.status, 200);
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
  t.is(res.headers.location, '/es');
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

  const res = await request(app.listen()).get('/en');

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

  const res = await request(app.listen()).get('/en');

  t.is(res.status, 200);
  t.true(spy.calledOnce);
  t.true(spy.alwaysCalledWithExactly(saveError));
});

test('returns an error object with no_translate=true', t => {
  const i18n = new I18N({ phrases, directory });
  t.is(i18n.translate('hello', 'en'), 'hello');
  const err = i18n.translateError('hello', 'es');
  t.true(err.no_translate);
  t.is(err.message, 'hola');
});

test('ctx.translates throws error with no_translate', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      ctx.status = err.statusCode || err.status || 500;
      ctx.body = {
        message: err.message
      };
    }
  });
  app.use(session());
  app.use(i18n.middleware);
  app.use(ctx => {
    const err = ctx.translateError('HELLO');
    t.true(err.no_translate);
    ctx.throw(err);
  });

  const res = await request(app.listen()).get('/en');
  t.is(res.status, 500);
  t.is(res.body.message, 'Hello there!');
});

test('errors if default locale does not exist', t => {
  t.throws(() => new I18N({ phrases, directory, defaultLocale: 'de' }), {
    message: 'Default locale of de must be included in list of locales'
  });
});

test('translate default locale', t => {
  const i18n = new I18N({ phrases, directory });

  t.is(i18n.translate('hello'), 'hello');
});

test('does not redirect if method is not GET', async t => {
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
    .get('/login.html')
    .set('Cookie', ['locale=es']);
  t.is(res.status, 200);
});

test('redirects sets users last_locale', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases, directory });

  app.use(async (ctx, next) => {
    ctx.state.user = { last_locale: 'en' };
    ctx.state.user.save = () => {};
    ctx.isAuthenticated = () => true;
    await next();
  });
  app.use(session());
  app.use(i18n.middleware);
  app.use(i18n.redirect);

  app.use(ctx => {
    const { locale } = ctx;
    ctx.body = {
      locale,
      last_locale: ctx.state.user.last_locale
    };
    ctx.status = 200;
  });

  const res = await request(app.listen()).get('/en/login');
  t.is(res.status, 200);
  t.is(res.body.last_locale, 'en');
});
