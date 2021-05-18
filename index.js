const { basename, extname, resolve } = require('path');

const { toASCII } = require('punycode/');

const Boom = require('@hapi/boom');
const debug = require('debug')('ladjs:i18n');
const { I18n } = require('i18n');
const locales = require('i18n-locales');
const multimatch = require('multimatch');
const titleize = require('titleize');
const tlds = require('tlds');
const { boolean } = require('boolean');
const { getLanguage } = require('@ladjs/country-language');
const { isEmpty, sortBy, every, isFunction } = require('lodash');
const { stringify } = require('qs');

const punycodedTlds = tlds.map((tld) => toASCII(tld));

class I18N {
  constructor(config = {}) {
    this.config = {
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
      syncFiles: boolean(process.env.I18N_SYNC_FILES || true),
      autoReload: boolean(process.env.I18N_AUTO_RELOAD || false),
      updateFiles: boolean(process.env.I18N_UPDATE_FILES || true),
      api: {
        __: 't',
        __n: 'tn',
        __l: 'tl',
        __h: 'th',
        __mf: 'tmf'
      },
      lastLocaleField: 'last_locale',
      ignoredRedirectGlobs: [],
      redirectIgnoresNonGetMethods: true,
      stringify: {
        addQueryPrefix: true,
        format: 'RFC1738',
        arrayFormat: 'indices'
      },
      redirectTLDS: true,
      detectLocale: false,
      ...config
    };

    // locales must be supplied as an array of string
    if (!Array.isArray(this.config.locales))
      throw new Error(`Locales must be an array of strings`);

    // validate locales against available ones
    if (!every(this.config.locales, (l) => locales.includes(l)))
      throw new Error(
        `Invalid locales: ${this.config.locales
          .filter((string) => !locales.includes(string))
          .join(', ')}`
      );

    // default locale must be in locales
    if (!this.config.locales.includes(this.config.defaultLocale))
      throw new Error(
        `Default locale of ${this.config.defaultLocale} must be included in list of locales`
      );

    // make sure expires is not set in cookieOptions
    if (this.config.cookieOptions.expires)
      throw new Error(
        'Please specify expiryMs config option instead of passing a Date to cookieOptions config'
      );

    // inherit i18n object
    Object.assign(this, new I18n());

    // expose shorthand API methods
    this.api = {};
    for (const key of Object.keys(this.config.api)) {
      this[this.config.api[key]] = this[key];
      this.api[key] = this[key];
      this.api[this.config.api[key]] = this[key];
    }

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
    return this.api.t({ phrase, locale }, ...args);
  }

  translateError(key, locale, ...args) {
    const string = this.translate(key, locale, ...args);
    const err = new Error(string);
    err.no_translate = true;
    return err;
  }

  async middleware(ctx, next) {
    const { locales, defaultLocale, phrases, cookie } = this.config;

    // expose api methods to `ctx.request` and `ctx.state`
    this.init(ctx.request, ctx.state);

    // expose a helper function to `ctx.state.l`
    // which prefixes a link/path with the locale
    ctx.state.l = (path = '') => {
      return `/${ctx.state.locale}${path}`;
    };

    // override the existing locale detection with our own
    // in order of priority:
    //
    // 1. check the URL, if === `/de` or starts with `/de/` then locale is `de`
    // 2. use a custom function, if provided in parameters
    // 3. check the cookie
    // 4. check Accept-Language last
    // 5. check the user's lastLocale
    //
    // also we need to expose `ctx.pathWithoutLocale`
    // as the path without locale

    let locale = locales.find((l) => {
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
        this.config.detectLocale &&
        typeof this.config.detectLocale === 'function'
      ) {
        locale = await this.config.detectLocale.call(this, ctx);
        debug('found locale via custom function using %s', locale);
      } else if (
        ctx.cookies.get(cookie) &&
        locales.includes(ctx.cookies.get(cookie))
      ) {
        locale = ctx.cookies.get(cookie);
        debug('found locale via cookie using %s', locale);
      } else if (acceptedLocale) {
        locale = acceptedLocale;
        debug('found locale via Accept-Language header using %s', locale);
      } else if (
        this.config.lastLocaleField &&
        isFunction(ctx.isAuthenticated) &&
        ctx.isAuthenticated() &&
        ctx.state.user[this.config.lastLocaleField]
      ) {
        // this supports API requests using the last locale of the user
        locale = ctx.state.user[this.config.lastLocaleField];
        debug("using logged in user's last locale %s", locale);
      } else {
        debug('using default locale %s', locale);
      }
    }

    // set the locale properly
    this.setLocale([ctx.request, ctx.state], locale);
    ctx.locale = ctx.request.locale;
    ctx.set('Content-Language', ctx.locale);

    // if the locale was not available then redirect user
    if (locale !== ctx.state.locale) {
      debug('locale was not available redirecting user');
      return ctx.redirect(
        `/${ctx.state.locale}${ctx.pathWithoutLocale}${
          isEmpty(ctx.query) ? '' : stringify(ctx.query, this.config.stringify)
        }`
      );
    }

    // available languages for a dropdown menu to change language
    ctx.state.availableLanguages = sortBy(
      locales.map((locale) => {
        let url = `/${locale}${ctx.pathWithoutLocale}`;
        // shallow clone it so we don't affect it
        const query = { ...ctx.query };
        if (!isEmpty(query)) {
          // if `redirect_to` was in the URL then check if i18n was in there too
          // that way we don't have `?redirect_to=/zh` when we switch from `zh` to `en`
          if (
            typeof query.redirect_to === 'string' &&
            query.redirect_to !== ''
          ) {
            for (const l of locales) {
              // if it's directly `?redirect_to=/en`
              if (query.redirect_to === `/${l}`) {
                query.redirect_to = `/${locale}`;
                break;
              }

              // if it's a path starting with a locale `?redirect_to=/en/foo`
              if (query.redirect_to.startsWith(`/${l}/`)) {
                query.redirect_to = query.redirect_to.replace(
                  `/${l}/`,
                  `/${locale}/`
                );
                break;
              }
            }
          }

          url += stringify(query, this.config.stringify);
        }

        return {
          locale,
          url,
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
    ctx.translate = function (...args) {
      if (typeof args[0] !== 'string' || typeof phrases[args[0]] !== 'string')
        return ctx.throw(
          Boom.badRequest('Translation for your locale failed, try again')
        );
      args[0] = phrases[args[0]];
      return ctx.request.t(...args);
    };

    ctx.translateError = function (...args) {
      const string = ctx.translate(...args);
      const err = new Error(string);
      err.no_translate = true;
      return err;
    };

    return next();
  }

  async redirect(ctx, next) {
    debug('attempting to redirect');

    // dummy-proof in case middleware is not in correct order
    // (e.g. i18n.middleware -> i18n.redirect)
    if (typeof ctx.request.locale === 'undefined')
      throw new Error(
        'Route middleware out of order, please use i18n.middleware BEFORE i18n.redirect'
      );

    // do not redirect static paths
    if (extname(ctx.path) !== '') {
      if (!this.config.redirectTLDS) return next();
      const asciiFile = toASCII(basename(ctx.path));
      if (!punycodedTlds.some((tld) => asciiFile.endsWith(`.${tld}`)))
        return next();
    }

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
        redirect += stringify(ctx.query, this.config.stringify);
      debug('no valid locale found in URL, redirecting to %s', redirect);
      return ctx.redirect(redirect);
    }

    debug('found valid language "%s"', locale);

    // set the cookie for future requests
    ctx.cookies.set(this.config.cookie, locale, {
      ...this.config.cookieOptions,
      expires: new Date(Date.now() + this.config.expiryMs)
    });
    debug('set cookies for locale "%s"', locale);

    // if the user is logged in and ctx.isAuthenticated() exists,
    // then save it as `last_locale` (variable based off lastLocaleField)
    if (
      this.config.lastLocaleField &&
      isFunction(ctx.isAuthenticated) &&
      ctx.isAuthenticated() &&
      ctx.state.user[this.config.lastLocaleField] !== locale
    ) {
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
