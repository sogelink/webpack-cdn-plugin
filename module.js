import path from 'path';

const empty = '';
const slash = '/';
const packageJson = 'package.json';
const paramsRegex = /:([a-z]+)/gi;
const DEFAULT_MODULE_KEY = 'defaultCdnModuleKey____';

class WebpackCdnPlugin {
  constructor({
    modules, prod,
    prodUrl = '//unpkg.com/:name@:version/:path',
    devUrl = ':name/:path', publicPath,
  }) {
    this.modules = Array.isArray(modules) ? { [DEFAULT_MODULE_KEY]: modules } : modules;
    this.prod = prod !== false;
    this.prefix = publicPath;
    this.url = this.prod ? prodUrl : devUrl;
  }

  apply(compiler) {
    const { output } = compiler.options;

    let outputPublicPath = output.publicPath || empty;

    if (outputPublicPath.length > 0 && outputPublicPath.slice(-1) !== slash) {
      outputPublicPath += slash;
    }

    this.prefix = this.prod ? empty : this.prefix || outputPublicPath;

    if (!this.prod && this.prefix.length > 0 && this.prefix.slice(-1) !== slash) {
      this.prefix += slash;
    }

    const getArgs = [this.url, this.prefix, this.prod, outputPublicPath];

    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('html-webpack-plugin-before-html-generation', (data, callback) => {
        const moduleId = data.plugin.options.cdnModule;
        if (moduleId !== false) {
          const modules = this.modules[moduleId || Reflect.ownKeys(this.modules)[0]];
          if (modules) {
            WebpackCdnPlugin._cleanModules(modules);
            data.assets.js = WebpackCdnPlugin._getJs(modules, ...getArgs).concat(data.assets.js);
            data.assets.css = WebpackCdnPlugin._getCss(modules, ...getArgs).concat(data.assets.css);
          }
        }
        callback(null, data);
      });
    });
    const externals = compiler.options.externals || {};

    Reflect.ownKeys(this.modules).forEach((key) => {
      const mods = this.modules[key];
      mods.forEach((p) => {
        externals[p.name] = p.var || p.name;
      });
    });

    compiler.options.externals = externals;
  }

  static getVersion(name) {
    return require(path.join(WebpackCdnPlugin.node_modules, name, packageJson)).version;
  }

  static _cleanModules(modules) {
    modules.forEach(p => {
      p.version = WebpackCdnPlugin.getVersion(p.name);

      if (!p.paths) {
        p.paths = [];
      }
      if (p.path) {
        p.paths.unshift(p.path);
      }
      if (p.paths.length === 0) {
        p.paths.push(require.resolve(p.name).match(/[\\/]node_modules[\\/].+?[\\/](.*)/)[1].replace(/\\/g, '/'));
      }

      if (!p.styles) {
        p.styles = [];
      }
      if (p.style) {
        p.styles.unshift(p.style);
      }
    });
  }

  static _getCss(modules, url, prefix, prod, publicPath) {
    prefix = prefix || empty;
    prod = prod !== false;

    let files = [];

    modules.filter(p => p.localStyle)
      .forEach(p => files.push(publicPath + p.localStyle));

    modules.filter(p => p.styles.length > 0)
      .forEach(p => {
        p.styles.forEach(s => files.push(
          prefix + url.replace(paramsRegex, (m, p1) => {
            if (prod && p.cdn && p1 === 'name') {
              return p.cdn;
            }

            return p1 === 'path' ? s : p[p1];
          })
        ))
      });

    return files;
  }

  static _getJs(modules, url, prefix, prod, publicPath) {
    prefix = prefix || empty;
    prod = prod !== false;

    let files = [];

    modules.filter(p => p.localScript)
      .forEach(p => files.push(publicPath + p.localScript));

    modules.filter(p => !p.cssOnly)
      .forEach(p => {
        p.paths.forEach(s => files.push(
          prefix + url.replace(paramsRegex, (m, p1) => {
            if (prod && p.cdn && p1 === 'name') {
              return p.cdn;
            }

            return p1 === 'path' ? s : p[p1];
          })
        ));
      });

    return files;
  }
}

WebpackCdnPlugin.node_modules = path.join(__dirname, '..');

export default WebpackCdnPlugin;
