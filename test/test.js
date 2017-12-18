const test = require('ava');
const request = require('supertest');
const session = require('koa-generic-session');
const Koa = require('koa');
const I18N = require('../src');

const phrases = { HELLO: 'Hello there!' };

test('returns itself', t => {
  t.true(new I18N() instanceof I18N);
});

test('returns correct locale from path', async t => {
  const app = new Koa();
  const i18n = new I18N({ phrases });

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
  const i18n = new I18N({ phrases });

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
  const i18n = new I18N({ phrases });

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
  const i18n = new I18N({ phrases });

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
  const i18n = new I18N({ phrases });

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
  const i18n = new I18N({ phrases });

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
