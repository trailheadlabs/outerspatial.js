/* globals L, module, require */

'use strict';

// TODO: Request access to user's location and use it to present results

var geocode = require('../util/geocode');
var util = require('../util/util');
var GeocoderControl = L.Control.extend({
  options: {
    position: 'topleft',
    provider: 'mapbox'
  },
  statics: {
    ATTRIBUTIONS: {
      BING: 'Geocoding by Microsoft',
      ESRI: 'Geocoding by Esri',
      MAPBOX: 'Geocoding by Mapbox',
      MAPQUEST: 'Geocoding by MapQuest',
      MAPZEN: 'Geocoding by Mapzen',
      NOMINATIM: [
        'Geocoding by Nominatim',
        '&copy; <a href=\'https://openstreetmap.org/copyright\'>OpenStreetMap</a> contributors'
      ]
    }
  },
  initialize: function (options) {
    L.Util.setOptions(this, options);

    return this;
  },
  onAdd: function (map) {
    var attribution = GeocoderControl.ATTRIBUTIONS[this.options.provider.toUpperCase()];
    var container = L.DomUtil.create('form', 'leaflet-control-geocoder');
    var div = map.getContainer();
    var me = this;
    var stopPropagation = L.DomEvent.stopPropagation;
    var childNodes = div.childNodes;
    var divContainer;
    var i;

    this._button = L.DomUtil.create('button', 'search', container);
    this._input = L.DomUtil.create('input', undefined, container);
    this._ul = L.DomUtil.create('ul', 'leaflet-control', container);

    // TODO: You should probably unhook these listeners in onRemove.
    if (childNodes && Array.isArray(childNodes) && childNodes.length) {
      for (i = 0; i < childNodes.length; i++) {
        var childNode = childNodes[i];

        childNode.onmousedown = function () {
          me._clearResults(me);
        };
      }
    }

    div.onmousedown = function () {
      me._clearResults(me);
    };

    divContainer = document.getElementsByClassName('leaflet-control-container');

    if (divContainer[0]) {
      childNodes = divContainer[0].childNodes;
    }

    if (childNodes && Array.isArray(childNodes) && childNodes.length) {
      for (i = 0; i < childNodes.length; i++) {
        var a = childNodes[i];

        if (a.childNodes && Array.isArray(a.childNodes) && a.childNodes.length) {
          for (var j = 0; j < a.childNodes.length; j++) {
            a.childNodes[j].onmousedown = function () {
              me._clearResults(me);
            };
          }
        }

        a.onmousedown = function () {
          me._clearResults(me);
        };
      }
    }

    map.on('movestart', function () {
      me._clearResults(me);
    });
    this._initalizeIndex();
    this._setIcon('search');
    L.DomEvent.disableClickPropagation(this._button);
    L.DomEvent.disableClickPropagation(this._input);
    L.DomEvent.disableClickPropagation(this._ul);
    L.DomEvent
      .on(this._button, 'click', this._geocodeRequest, this)
      .on(this._button, 'mousewheel', stopPropagation)
      .on(this._input, 'focus', function () {
        if (map.isDockedPopupOpen) {
          map.closeDockedPopup();
        }

        this.value = this.value;

        if (me._results) {
          me._resultsReady(this.value, me._results);
        }
      })
      .on(this._input, 'mousewheel', stopPropagation)
      .on(this._ul, 'mousewheel', stopPropagation);

    this._container = container;
    this._button.setAttribute('alt', 'Search');
    this._input.setAttribute('aria-activedescendant', null);
    this._input.setAttribute('aria-autocomplete', 'list');
    this._input.setAttribute('aria-expanded', false);
    this._input.setAttribute('aria-label', 'Geocode');
    this._input.setAttribute('aria-owns', 'geocoder_listbox');
    this._input.setAttribute('placeholder', 'Find a Location');
    this._input.setAttribute('role', 'combobox');
    this._input.setAttribute('type', 'text');
    this._ul.setAttribute('id', 'geocoder_listbox');
    this._ul.setAttribute('role', 'listbox');

    if (attribution) {
      if (L.Util.isArray(attribution)) {
        for (i = 0; i < attribution.length; i++) {
          map.attributionControl.addAttribution(attribution[i]);
        }
      } else {
        map.attributionControl.addAttribution(attribution);
      }
    }

    if (this._map.getContainer().clientWidth < 375) {
      this.collapse();
    }

    return container;
  },
  onRemove: function (map) {
    var attribution = GeocoderControl.ATTRIBUTIONS[this.options.provider.toUpperCase()];

    if (attribution) {
      if (L.Util.isArray(attribution)) {
        for (var i = 0; i < attribution.length; i++) {
          map.attributionControl.removeAttribution(attribution[i]);
        }
      } else {
        map.attributionControl.removeAttribution(attribution);
      }
    }
  },
  collapse: function () {
    this._input.style.width = '160px';
    this._ul.style.width = '200px';
  },
  expand: function () {
    this._input.style.width = '200px';
    this._ul.style.width = '240px';
  },
  _checkScroll: function () {
    if (this._selected) {
      var top = util.getPosition(this._selected).top;
      var bottom = top + util.getOuterDimensions(this._selected).height;
      var scrollTop = this._ul.scrollTop;
      var visible = [
        scrollTop,
        scrollTop + util.getOuterDimensions(this._ul).height
      ];

      if (top < visible[0]) {
        this._ul.scrollTop = top - 10;
      } else if (bottom > visible[1]) {
        this._ul.scrollTop = top - 10;
      }
    }
  },
  _clearResults: function (context) {
    context._oldValue = '';
    context._selected = null;

    if (context._input) {
      context._input.setAttribute('aria-activedescendant', null);
      context._input.setAttribute('aria-expanded', false);
    }

    if (context._ul) {
      context._ul.innerHTML = '';
      context._ul.scrollTop = 0;
      context._ul.style.display = 'none';
    }
  },
  _debounce: function (fn, delay) {
    var timer = null;

    return function () {
      var args = arguments;
      var context = this;

      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  },
  _geocodeRequest: function (e) {
    var value = this._input.value;

    if (typeof e === 'object') {
      L.DomEvent.preventDefault(e);
    }

    if (value.length) {
      var me = this;

      me._clearResults(this);
      me._showLoading();
      geocode[me.options.provider](value, function (result) {
        me._hideLoading();

        if (result && result.success) {
          if (result.results && result.results.length) {
            var first = result.results[0];

            if (first.bounds) {
              if (me._map.options.maxBounds) {
                if (me._map.options.maxBounds.contains(first.bounds)) {
                  me._map.fitBounds(first.bounds);
                } else {
                  me._map.notify.danger('The result was located outside the boundary of the map.');
                }
              } else {
                me._map.fitBounds(first.bounds);
              }
            } else if (first.latLng) {
              if (me._map.options.maxBounds) {
                if (me._map.options.maxBounds.contains(first.latLng)) {
                  me._map.setView(first.latLng, 17);
                } else {
                  me._map.notify.danger('The result was located outside the boundary of the map.');
                }
              } else {
                me._map.setView(first.latLng, 17);
              }
            } else {
              me._map.notify.danger('There was an error finding that location. Please try again.');
            }
          } else {
            if (result.message) {
              me._map.notify.danger(result.message);
            } else {
              me._map.notify.danger('There was an error finding that location. Please try again.');
            }
          }
        } else {
          me._map.notify.danger('There was an error finding that location. Please try again.');
        }
      });
    }
  },
  _handleSelect: function (li) {
    var id = li.id;
    var me = this;
    var map = me._map;
    var latLng = me._results[id].latLng;
    var layer = me._results[id].layer;
    var html = L.outerspatial.popup()._resultToHtml(layer.feature.properties, layer.options.popup, null, null, map.options.popup, layer);
    var usesDockedPopup = map.options.dockedPopups;

    if (typeof html === 'string') {
      html = util.unescapeHtml(html);
    }

    this._clearResults(me);
    this._isDirty = false;
    this._input.setAttribute('aria-activedescendant', id);

    if (latLng) {
      if (usesDockedPopup) {
        setTimeout(function () {
          map.setView(map.unproject(map.project(latLng, 17).add([
            -150,
            0
          ]), 17), 17);
        }, 300);
      } else {
        map.setView(latLng, 17);
      }
    } else {
      if (usesDockedPopup) {
        setTimeout(function () {
          map.fitBounds(layer.getBounds(), {
            paddingTopLeft: [
              300,
              0
            ],
            paddingBottomRight: [
              0,
              0
            ]
          });
        }, 300);
      } else {
        map.fitBounds(layer.getBounds());
      }
    }

    map.setSelectedLayer(layer);

    if (usesDockedPopup) {
      map.setDockedPopupContent(html);
      map.openDockedPopup();
    }

    map.options.div.focus();
  },
  _hideLoading: function () {
    L.DomEvent.on(this._button, 'click', this._geocodeRequest, this);
    L.DomUtil.addClass(this._button, 'search');
    L.DomUtil.removeClass(this._button, 'working');
    this._setIcon('search');
  },
  _initalizeIndex: function () {
    var me = this;

    L.DomEvent.on(me._input, 'keydown', function (e) {
      switch (e.keyCode) {
        case 13:

          if (me._selected) {
            me._handleSelect(me._selected);
          }

          break;
        case 27:
          // Escape
          me._clearResults(me);
          break;
        case 38:
          // Up
          if (me._ul.style.display === 'block') {
            if (me._selected) {
              L.DomUtil.removeClass(me._selected, 'selected');
              me._selected = util.getPreviousSibling(me._selected);
            }

            if (!me._selected) {
              me._selected = me._ul.childNodes[me._ul.childNodes.length - 1];
            }

            L.DomUtil.addClass(me._selected, 'selected');
            me._checkScroll();
          }

          L.DomEvent.preventDefault(e);
          break;
        case 40:
          // Down
          if (me._ul.style.display === 'block') {
            if (me._selected) {
              L.DomUtil.removeClass(me._selected, 'selected');
              me._selected = util.getNextSibling(me._selected);
            }

            if (!me._selected) {
              me._selected = me._ul.childNodes[0];
            }

            L.DomUtil.addClass(me._selected, 'selected');
            me._checkScroll();
          }

          L.DomEvent.preventDefault(e);
          break;
      }
    });
    L.DomEvent.on(me._input, 'keyup', me._debounce(function (e) {
      var value = this.value;

      if (value) {
        var keyCode = e.keyCode;

        if (keyCode !== 13 && keyCode !== 27 && keyCode !== 38 && keyCode !== 40) {
          if (value !== me._oldValue) {
            me._isDirty = true;
            me._oldValue = value;

            if (value.length) {
              var overlays = window.OuterSpatial.config.overlays;

              me._results = [];

              if (Array.isArray(overlays)) {
                for (var i = 0; i < overlays.length; i++) {
                  if (typeof overlays[i].search === 'function') {
                    me._results = me._results.concat(overlays[i].search(value));
                  }
                }
              }

              me._results.sort(function (a, b) {
                var aName = a.name.toUpperCase();
                var bName = b.name.toUpperCase();

                if (aName < bName) {
                  return -1;
                } else if (aName > bName) {
                  return 1;
                } else {
                  return 0;
                }
              });

              me._resultsReady(value, me._results);
            }
          }
        }
      } else {
        me._clearResults(me);
      }
    }, 250));
  },
  _resultsReady: function (value, results) {
    var me = this;

    if (results.length > 0) {
      me._clearResults(me);

      for (var i = 0; i < results.length; i++) {
        var li = L.DomUtil.create('li', null, me._ul);
        var result = results[i];
        var d = result.name;
        var t = result.type;
        var j;

        li.className = 'outerspatial-geocoder-result-park';
        li.id = i;

        j = d.toLowerCase().indexOf(value.toLowerCase());
        li.innerHTML = (d.slice(0, j) + '<strong>' + d.slice(j, j + value.length) + '</strong>' + d.slice(j + value.length) + (t ? '<br><i>' + t + '</i>' : ''));
        L.DomEvent.on(li, 'click', function () {
          me._handleSelect(this);
        });
      }

      me._ul.style.display = 'block';
      me._input.setAttribute('aria-expanded', true);
    } else {
      me._clearResults(me);
    }
  },
  _setIcon: function (icon) {
    if (icon === 'search') {
      this._button.innerHTML = '' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">' +
          '<g class="icon-svg-path">' +
            '<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>' +
          '</g>' +
        '</svg>';
    } else if (icon === 'working') {
      this._button.innerHTML = '' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="18" height="18">' +
          '<g class="icon-svg-path">' +
            '<path vector-effect="non-scaling-stroke" d="M6,32C6,17.664,17.664,6,32,6c6.348,0,12.391,2.285,17.136,6.45l-6.843,6.843 c-0.271,0.271-0.363,0.673-0.238,1.035c0.126,0.362,0.447,0.62,0.828,0.665l17,2C59.922,22.998,59.961,23,60,23 c0.264,0,0.519-0.104,0.707-0.293c0.216-0.216,0.322-0.52,0.286-0.824l-2-17c-0.045-0.381-0.303-0.702-0.665-0.828 c-0.362-0.125-0.765-0.034-1.035,0.238l-5.326,5.326C46.462,4.703,39.412,2,32,2C15.458,2,2,15.458,2,32c0,1.104,0.896,2,2,2 S6,33.104,6,32z"/>' +
            '<path vector-effect="non-scaling-stroke" d="M60,30c-1.104,0-2,0.896-2,2c0,14.337-11.664,26-26,26c-6.348,0-12.391-2.285-17.135-6.451l6.842-6.842 c0.271-0.271,0.363-0.673,0.238-1.035c-0.126-0.362-0.447-0.62-0.828-0.665l-17-2c-0.306-0.036-0.608,0.07-0.824,0.286 c-0.216,0.217-0.322,0.52-0.286,0.824l2,17c0.045,0.38,0.303,0.702,0.665,0.827C5.779,59.981,5.89,60,6,60 c0.261,0,0.517-0.103,0.707-0.293l5.326-5.326C17.538,59.297,24.587,62,32,62c16.542,0,30-13.458,30-30C62,30.896,61.104,30,60,30z"/>' +
            '<animateTransform attributeType="xml" attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="1.0s" repeatCount="indefinite"/>' +
          '</g>' +
        '</svg>';
    }
  },
  _showLoading: function () {
    L.DomEvent.off(this._button, 'click', this._geocodeRequest);
    L.DomUtil.addClass(this._button, 'working');
    L.DomUtil.removeClass(this._button, 'search');
    this._setIcon('working');
  }
});

L.Map.mergeOptions({
  geocoderControl: false
});
L.Map.addInitHook(function () {
  if (this.options.geocoderControl) {
    var options = {};

    if (typeof this.options.geocoderControl === 'object') {
      options = this.options.geocoderControl;
    }

    this.geocoderControl = L.outerspatial.control.geocoder(options).addTo(this);
    this.on('resize', function (e) {
      if (e.newSize.x >= 373) {
        this.geocoderControl.expand();
      } else {
        this.geocoderControl.collapse();
      }
    });
  }
});

module.exports = function (options) {
  return new GeocoderControl(options);
};
