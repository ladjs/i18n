const { extname, resolve } = require('path');

const Boom = require('@hapi/boom');
const debug = require('debug')('ladjs:i18n');
const i18n = require('i18n');
const locales = require('i18n-locales');
const moment = require('moment');
const multimatch = require('multimatch');
const titleize = require('titleize');
const { boolean } = require('boolean');
const { getLanguage } = require('country-language');
const { isEmpty, sortBy, every, isFunction } = require('lodash');
const { stringify } = require('qs');

// expose global
i18n.api = {};

class I18N {
  constructor(config = {}) {
    this.config = Object.assign(
      {
        phrases: {},
        logger: console,
        directory: resolve('locales'),
        locales: ['en', 'es', 'zh'],
        cookie: 'locale',
        indent: '  ',
        defaultLocale: 'en',
        syncFiles: boolean(process.env.I18N_SYNC_FILES || true),
        autoReload: boolean(process.env.I18N_AUTO_RELOAD || true),
        updateFiles: boolean(process.env.I18N_UPDATE_FILES || true),
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
        stringify: {
          addQueryPrefix: true,
          format: 'RFC1738',
          arrayFormat: 'indices'
        }
      },
      config
    );

    // validate locales against available ones
    if (!every(this.config.locales, l => locales.includes(l)))
      throw new Error(
        `Invalid locales: ${this.config.locales
          .filter(str => !locales.includes(str))
          .join(', ')}`
      );

    // default locale must be in locales
    if (!this.config.locales.includes(this.config.defaultLocale))
      throw new Error(
        `Default locale of ${this.config.defaultLocale} must be included in list of locales`
      );

    // inherit i18n object
    Object.assign(this, i18n);

    // configure i18n
    this.configure(this.config);

    this.translate = this.translate.bind(this);
    this.translateError = this.translateError.bind(this);
    this.middleware = this.middleware.bind(this);
    this.redirect = this.redirect.bind(this);
  }

  translate(key, locale, ...args) {
    locale = locale || this.config.defaultLocale;
    const { phrases } = this.config;
    const phrase = phrases[key];
    if (typeof phrase !== 'string')
      throw new Error(`translation key missing: ${key}`);
    return i18n.api.t({ phrase, locale }, ...args);
  }

  translateError(key, locale, ...args) {
    const str = this.translate(key, locale, ...args);
    const err = new Error(str);
    err.no_translate = true;
    return err;
  }

  middleware(ctx, next) {
    const { locales, defaultLocale, phrases, cookie } = this.config;

    // expose api methods to `ctx.request` and `ctx.state`
    i18n.init(ctx.request, ctx.state);

    // expose a helper function to `ctx.state.l`
    // which prefixes a link/path with the locale
    ctx.state.l = (path = '') => {
      return `/${ctx.state.locale}${path}`;
    };

    // override the existing locale detection with our own
    // in order of priority:
    //
    // 1. check the URL, if === `/de` or starts with `/de/` then locale is `de`
    // 2. check the cookie
    // 3. check Accept-Language last
    //
    // also we need to expose `ctx.pathWithoutLocale`
    // as the path without locale

    let locale = locales.find(l => {
      return `/${l}` === ctx.path || ctx.path.indexOf(`/${l}/`) === 0;
    });

    ctx.pathWithoutLocale = locale
      ? ctx.path.slice(`/${locale}`.length)
      : ctx.path;
    if (ctx.pathWithoutLocale === '') ctx.pathWithoutLocale = '/';

    if (!locale) {
      locale = defaultLocale;
      // if "Accepts: */*" or "Accept-Language: */*"
      // then the accepted locale will be the first in
      // the list of provided locales, and as such we must
      // preserve the defaultLocale as the preferred language
      const acceptedLocale = ctx.request.acceptsLanguages([
        ...new Set([defaultLocale, ...locales])
      ]);
      if (
        ctx.cookies.get(cookie) &&
        locales.includes(ctx.cookies.get(cookie))
      ) {
        locale = ctx.cookies.get(cookie);
        debug('found locale via cookie using %s', locale);
      } else if (acceptedLocale) {
        locale = acceptedLocale;
        debug('found locale via Accept-Language header using %s', locale);
      } else {
        debug('using default locale', locale);
      }
    }

    // set the locale properly
    i18n.setLocale([ctx.request, ctx.state], locale);
    ctx.locale = ctx.request.locale;

    // if the locale was not available then redirect user
    if (locale !== ctx.state.locale) {
      debug('locale was not available redirecting user');
      return ctx.redirect(
        `/${ctx.state.locale}${ctx.pathWithoutLocale}${
          isEmpty(ctx.query)
            ? ''
            : `?${stringify(ctx.query, this.config.stringify)}`
        }`
      );
    }

    // available languages for a dropdown menu to change language
    ctx.state.availableLanguages = sortBy(
      locales.map(locale => {
        return {
          locale,
          url: `/${locale}${ctx.pathWithoutLocale}${
            isEmpty(ctx.query)
              ? ''
              : `?${stringify(ctx.query, this.config.stringify)}`
          }`,
          name: getLanguage(locale).name[0]
        };
      }),
      'name'
    );

    // get the name of the current locale's language in native language
    ctx.state.currentLanguage = titleize(
      getLanguage(ctx.request.locale).nativeName[0]
    );

    // bind `ctx.translate` as a helper func
    // so you can pass `ctx.translate('SOME_KEY_IN_CONFIG');` and it will lookup
    // `phrases['SOMETHING']` to get a specific and constant message
    // and then it will call `t` to translate it to the user's locale
    ctx.translate = function(...args) {
      if (typeof args[0] !== 'string' || typeof phrases[args[0]] !== 'string')
        return ctx.throw(
          Boom.badRequest('Translation for your locale failed, try again')
        );
      args[0] = phrases[args[0]];
      return ctx.request.t(...args);
    };

    return next();
  }

  async redirect(ctx, next) {
    debug('attempting to redirect');
    // do not redirect static paths
    if (extname(ctx.path) !== '') return next();

    // if the method is not a GET request then ignore it
    if (this.config.redirectIgnoresNonGetMethods && ctx.method !== 'GET')
      return next();

    // check against ignored/whitelisted redirect middleware paths
    const match = multimatch(ctx.path, this.config.ignoredRedirectGlobs);
    if (Array.isArray(match) && match.length > 0) {
      debug(`multimatch found matches for ${ctx.path}:`, match);
      return next();
    }

    // inspired by nodejs.org language support
    // <https://github.com/nodejs/nodejs.org/commit/d6cdd942a8fc0fffcf6879eca124295e95991bbc#diff-78c12f5adc1848d13b1c6f07055d996eR59>
    const locale = ctx.url.split('/')[1].split('?')[0];
    const hasLang = this.config.locales.includes(locale);

    // if the URL did not have a valid language found
    // then redirect the user to their detected locale
    if (!hasLang) {
      ctx.status = 302;
      let redirect = `/${ctx.request.locale}${ctx.path}`;
      if (redirect === `/${ctx.request.locale}/`)
        redirect = `/${ctx.request.locale}`;
      if (!isEmpty(ctx.query))
        redirect += `${stringify(ctx.query, this.config.stringify)}`;
      debug('no valid locale found in URL, redirecting to %s', redirect);
      return ctx.redirect(redirect);
    }

    debug('found valid language "%s"', locale);

    // set the cookie for future requests
    ctx.cookies.set(this.config.cookie, locale, {
      // Disable signed cookies in NODE_ENV=test
      signed: process.env.NODE_ENV !== 'test',
      expires: moment()
        .add(1, 'year')
        .toDate()
    });
    debug('set cookies for locale "%s"', locale);

    // if the user is logged in and ctx.isAuthenticated() exists,
    // then save it as `last_locale` (variable based off lastLocaleField)
    if (isFunction(ctx.isAuthenticated) && ctx.isAuthenticated()) {
      ctx.state.user[this.config.lastLocaleField] = locale;
      try {
        await ctx.state.user.save();
      } catch (err) {
        this.config.logger.error(err);
      }
    }

    return next();
  }
}

module.exports = I18N;
