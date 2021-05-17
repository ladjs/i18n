# [**@ladjs/i18n**](https://github.com/ladjs/i18n)

[![build status](https://img.shields.io/travis/ladjs/i18n.svg)](https://travis-ci.org/ladjs/i18n)
[![code coverage](https://img.shields.io/codecov/c/github/ladjs/i18n.svg)](https://codecov.io/gh/ladjs/i18n)
[![code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![made with lass](https://img.shields.io/badge/made_with-lass-95CC28.svg)](https://lass.js.org)
[![license](https://img.shields.io/github/license/ladjs/i18n.svg)]()

> i18n wrapper and Koa middleware for Lad


## Table of Contents

* [Install](#install)
* [Usage](#usage)
* [API](#api)
  * [i18n.translate(key, locale, ...args)](#i18ntranslatekey-locale-args)
  * [i18n.translateError(key, locale, ...args)](#i18ntranslateerrorkey-locale-args)
  * [i18n.middleware(ctx, next)](#i18nmiddlewarectx-next)
  * [i18n.redirect(ctx, next)](#i18nredirectctx-next)
* [Options](#options)
* [Redirect exceptions](#redirect-exceptions)
* [Contributors](#contributors)
* [License](#license)


## Install

[npm][]:

```sh
npm install @ladjs/i18n
```

[yarn][]:

```sh
yarn add @ladjs/i18n
```


## Usage

```js
const I18N = require('@ladjs/i18n');
const phrases = { 'HELLO': 'Hello there!' };
const i18n = new I18N({ phrases });

// ...

app.use(i18n.middleware);
app.use(i18n.redirect);

// ... routes go here ...

app.listen();
```


## API

### i18n.translate(key, locale, ...args)

Returns translation for phrase `key` with the given `locale`.  Optionally pass additional arguments, e.g. format specifier replacements for use in the phrase.  For example if you have a phrase of "An error occurred %s" with a key of "ERROR_OCCURRED", and you use it as such `i18n.translate('ERROR_OCCURRED', 'en', 'some error message')` then it would return `'An error occurred some error message`.

### i18n.translateError(key, locale, ...args)

Returns the same string as `i18n.translate`, but wrapped with a new `Error` object with a property `no_translate` set to `true`.

This is an extremely useful method if you are using `koa-better-error-handler` package in the [Lad][] framework – as it will prevent a double translation from occurring.

### i18n.middleware(ctx, next)

This middleware uses custom locale detection (in order of priority):

1. Check URL (e.g. if `/de` or `/de/` then it's a `de` locale - as long as `de` is a supported locale)
2. Use the custom function (if provided by the `detectLocale` parameter) for locale detection
3. Check the `"locale"` cookie value (or whatever the `cookie` option is defined as)
4. Check `Accept-Language` header

It also exposes the following:

* `ctx.pathWithoutLocale` - the `ctx.path` without the locale in it (this is used by [koa-meta][])
* `ctx.request` - with all of `i18n` API methods (e.g. `ctx.request.t`, `ctx.request.tn`, ...)
* `ctx.locale` - set to the value of `ctx.request.locale` (the current user's locale)
* `ctx.state` - with all of `i18n` API methods (e.g. `ctx.request.t`, `ctx.request.tn`, ...)
* `ctx.state.l` - a shorthand method that accepts a path and returns a localized path (e.g. `ctx.state.l('/contact')` will output `/en/contact` if the locale is "en")
* `ctx.state.availableLanguages` (Array) - which is useful for adding a dropdown to select from an available language
* `ctx.state.currentLanguage` (String) - the current locale's language in native language using [country-language][]'s `getLanguage` method
* `ctx.translate` (Function) - a helper function for calling `i18n.api.t` or `i18n.t` to translate a given phrase by its property key name from the `phrases` object option (same as `i18n.translate` except it throws a `ctx.throw` error using [Boom][])
* `ctx.translateError` (Function) - same as `ctx.translate` except it returns an Error object with a property `no_translate` set to `true` (similar to `i18n.translateError`)

If the given locale was not available then it will redirect the user to the detected (or default/fallback) locale.

### i18n.redirect(ctx, next)

> Inspired by [node][]'s [language support][language-support].

Redirects user with permanent `302` redirect to their detected locale if a valid language was not found for them.

**NOTE:** As of v1.2.2 we have added a `ignoredRedirectGlobs` option you can pass to `new I18N({ ... })` which will ignore these paths for locale redirection.  This is incredibly useful if you are using authentication providers and the `passport` library, e.g. you want to set `/auth/github/ok` as the callback URL for GitHub, but a redirect to `/en/auth/github/ok` would have occurred, thus causing authentication to fail due to a bad code.  In this case, you would set `{ ignoredRedirectGlobs: [ '/auth/**/*' ] }` or simply `[ '/auth/google/ok' ]`.  This package uses [multimatch][] internally which supports an Array, therefore you could negate certain paths if needed.  See the documentation for [multimatch][] for more insight.

It also sets the cookie `locale` for future requests to their detected locale.

This also stores the `last_locale` (or whatever you configure the property name to be in the config option `lastLocaleField`) for a user via `ctx.state.user.save()`.

**NOTE:** As of v3.0.0 we have added a `redirectIgnoresNonGetMethods` (Boolean) option (defaults to `true`) which you can pass to `new I18N({ ... })` which will ignore non-GET methods on redirection.


## Options

> We use [i18n][] options per <https://github.com/mashpie/i18n-node#list-of-all-configuration-options>

Default options are as follows and can be overridden:

```js
const i18n = new I18N({
  phrases: {},
  logger: console,
  directory: resolve('locales'),
  locales: ['en', 'es', 'zh'],
  cookie: 'locale',
  cookieOptions: {
    // Disable signed cookies in NODE_ENV=test
    signed: process.env.NODE_ENV !== 'test'
  },
  expiryMs: 31556952000, // one year in ms
  indent: '  ',
  defaultLocale: 'en',
  // `process.env.I18N_SYNC_FILES`
  syncFiles: true,
  // `process.env.I18N_AUTO_RELOAD`
  autoReload: false,
  // `process.env.I18N_UPDATE_FILES`
  updateFiles: true,
  api: {
    __: 't',
    __n: 'tn',
    __l: 'tl',
    __h: 'th',
    __mf: 'tmf'
  },
  register: i18n.api,
  lastLocaleField: 'last_locale',
  ignoredRedirectGlobs: [],
  redirectIgnoresNonGetMethods: true,
  // <https://github.com/ljharb/qs>
  stringify: {
    addQueryPrefix: true,
    format: 'RFC1738',
    arrayFormat: 'indices'
  },
  redirectTLDS: true,
  // function that allows using a custom logic for locale detection (can return promise)
  detectLocale: null
});
```

If you wish to bind `logDebugFn`, `logWarnFn`, and `logErrorFn` per [i18n][] options:

```js
const i18n = new I18N({
  logDebugFn: console.log,
  logWarnFn: console.log,
  logErrorFn: console.log
});
```

We recommend to use [CabinJS][cabin] for all your logging needs.

For a list of all available locales see [i18n-locales][].


## Redirect exceptions

If the path has an extension, then it is not redirected.

However if `redirectTLDS` option is `true` (which is `true` by default as of v4.0.0), then if the path basename ends with a valid TLD, then it is redirected.

We came across this missing feature and added it after our discovery through [Forward Email](https://forwardemail.net).


## Contributors

| Name             | Website                           |
| ---------------- | --------------------------------- |
| **Nick Baugh**   | <http://niftylettuce.com/>        |
| **shadowgate15** | <https://github.com/shadowgate15> |


## License

[MIT](LICENSE) © [Nick Baugh](http://niftylettuce.com/)


##

[npm]: https://www.npmjs.com/

[yarn]: https://yarnpkg.com/

[i18n]: https://github.com/mashpie/i18n-node

[i18n-locales]: https://github.com/ladjs/i18n-locales

[koa-meta]: https://github.com/ladjs/koa-meta

[country-language]: https://github.com/ladjs/country-language

[boom]: https://github.com/hapijs/boom

[node]: https://nodejs.org

[language-support]: https://github.com/nodejs/nodejs.org/commit/d6cdd942a8fc0fffcf6879eca124295e95991bbc#diff-78c12f5adc1848d13b1c6f07055d996eR59

[cabin]: https://cabinjs.com

[multimatch]: https://github.com/sindresorhus/multimatch

[lad]: https://github.com/ladjs/lad
