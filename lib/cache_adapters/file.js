/**
 * Copyright (c) 2015 Translation Exchange, Inc.
 *
 *  _______                  _       _   _             ______          _
 * |__   __|                | |     | | (_)           |  ____|        | |
 *    | |_ __ __ _ _ __  ___| | __ _| |_ _  ___  _ __ | |__  __  _____| |__   __ _ _ __   __ _  ___
 *    | | '__/ _` | '_ \/ __| |/ _` | __| |/ _ \| '_ \|  __| \ \/ / __| '_ \ / _` | '_ \ / _` |/ _ \
 *    | | | | (_| | | | \__ \ | (_| | |_| | (_) | | | | |____ >  < (__| | | | (_| | | | | (_| |  __/
 *    |_|_|  \__,_|_| |_|___/_|\__,_|\__|_|\___/|_| |_|______/_/\_\___|_| |_|\__,_|_| |_|\__, |\___|
 *                                                                                        __/ |
 *                                                                                       |___/
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

var tml = require('tml-js');

/**
 * File cache adapter
 *
 * @param config
 * @constructor
 */
var File = function(config) {
  this.config = config || {};
  this.fs = require('fs-extra');
};

/**
 * File cache adapter methods
 */
File.prototype = tml.utils.extend(new tml.CacheAdapterBase(), {

  name: "file",

  getVersion: function(callback) {
    callback(0);
  },

  incrementVersion: function(callback) {
    callback(0);
  },

  fetch: function(key, def, callback) {
    callback = callback || function(){};

    var file_path = this.filePath(key);
    var self = this;

    // console.log("Loading " + file_path);

    self.fs.exists(file_path, function (exists) {
      if (!exists) {
        self.info("Cache miss " + key);
        callback(null, null);
      } else {
        self.fs.readFile(file_path, 'utf8', function (err, data) {
          if (data) {
            self.info("cache hit " + key);
          } else {
            self.info("cache miss " + key);
          }
          callback(err, data);
        });
      }
    });
  },

  fetch1: function(key, def, callback) {
    var 
      value,
      file_path = this.filePath(key),
      self = this;

    console.log("Loading " + file_path);

    if (!self.fs.exists(file_path)) {
      self.info("Cache miss " + key);
      value = (typeof def == "function") ? def() : def || null;
      if (callback) callback(null, value);
      return;
    }

    self.fs.readFile(file_path, 'utf8', function (err, data) {
      if (err) {
        self.info("Cache miss " + key);
        value = (typeof def == "function") ? def() : def || null;
      } else {
        self.info("Cache hit " + key);
        value = data;
      }
      if (callback) callback(null, value);
    });
  },

  getSelectedVersion: function() {
    return this.config.version || 'current';
  },

  basePath: function() {
    // return "./../../cache/files/current";
    return this.config.path || './cache';
  },

  cachePath: function() {
    return this.basePath() + '/' + this.getSelectedVersion();
  },

  filePath: function(key) {
    return this.cachePath() + '/' + this.fileName(key);
  },

  store: function(key, value) {
    this.warn("This is a readonly cache");
  },

  del: function(key) {
    this.warn("This is a readonly cache");
    return null;
  },

  getCurrentVersion: function() {
    if (!this.current_version) {
      var date = new Date();
      this.current_version = "" + date.getFullYear() + "" + date.getMonth() + "" + date.getDay() + "" +
        date.getHours() + "" + date.getMinutes() + "" + date.getSeconds();
    }
    return this.current_version;
  },

  getVersionedPath: function() {
    return this.basePath() + '/' + this.getCurrentVersion();
  },

  generateSources: function(api_client, locale, sources, callback) {
    var data = {};
    var self = this;

    sources.forEach(function(source) {
      data[source.key] = function(callback) {
        api_client.get("sources/" + source.key + '/translations', {locale:locale, per_page: 100000, sources: true, original: true}, {}, function(error, data) {
          if (error) {
            callback(error, null);
            return;
          }

          var source_path = self.getVersionedPath() + "/" + locale + "/sources";
          self.fs.ensureDir(source_path, function() {
            var source_file = source_path + "/" + source.source + ".json";
            self.fs.writeFile(source_file, JSON.stringify(data), function(err) {
              if (err) {
                console.log(err);
                throw err;
              }
              callback(null, data);
            });
          });

        });
      };
    });

    tml.utils.parallel(data, function(err, results) {
      if (err) {
        console.log(err);
        throw err;
      }

      callback();
    });
  },

  generateLanguages: function(api_client, locales, sources, callback) {
    var data = {};

    var self = this;

    locales.forEach(function(locale) {
      data[locale] = function(callback) {
        api_client.get("languages/" + locale, {definition: true}, {}, function(error, data) {
          if (error) {
            callback(error, null);
            return;
          }

          var language_path = self.getVersionedPath()  + "/" + locale;
          self.fs.ensureDir(language_path, function() {
            self.fs.writeFile(language_path + "/language.json", JSON.stringify(data), function(err) {
              if (err) {
                console.log(err);
                throw err;
              }
              self.generateSources(api_client, locale, sources, function() {
                callback(null, data);
              });
            });
          });
        });
      };
    });

    tml.utils.parallel(data, function(err, results) {
      if (err) {
        console.log(err);
        throw err;
      }

      callback();
    });
  },

  loadSources: function(api_client, callback) {
    api_client.get("applications/current/sources", {}, {}, function (err, data) {
      if (err) {
        console.log(err);
        throw err;
      }

      callback(data.results);
    });
  },

  /**
   * TODO: move to generators
   * @param callback
   */
  generate: function(callback) {
    console.log("Generating cache: " + this.getCurrentVersion());

    var app = new tml.Application(tml.config.application);
    var self = this;

    app.getApiClient().get("projects/current/definition", {}, {}, function (err, data) {
      if (err) {
        console.log(err);
        throw err;
      }

      self.fs.ensureDir(self.getVersionedPath(), function() {
        self.fs.writeFile(self.getVersionedPath() + "/application.json", JSON.stringify(data), function(err) {
          if (err) {
            console.log(err);
            throw err;
          }

          if (data.languages) {
            var locales = [];
            data.languages.forEach(function(lang) {
              locales.push(lang.locale);
            });

            self.loadSources(app.getApiClient(), function(sources) {
              self.generateLanguages(app.getApiClient(), locales, sources, function() {

                var current_path = self.basePath() + '/current';
                self.fs.unlink(current_path, function() {
                  self.fs.symlink(self.getCurrentVersion(), current_path, function() {
                    callback();
                  });
                });

              });
            });

          } else {
            callback();
          }
        });
      });
    });
  }

});

module.exports = File;