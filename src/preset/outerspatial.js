/* global L */

'use strict';

var reqwest = require('reqwest');

var OuterSpatialLayer = L.GeoJSON.extend({
  includes: [
    require('../mixin/geojson')
  ],
  options: {
    environment: 'production',
    searchable: false,
    formatPopups: true
  },
  initialize: function (options) {
    var me;
    var type;

    L.Util.setOptions(this, this._toLeaflet(options));

    if (!this.options.locationType) {
      console.error('The "locationType" property is required for the OuterSpatial preset.');
    }

    if (!this.options.organizationId) {
      console.error('The "organizationId" property is required for the OuterSpatial preset.');
    }

    type = options.locationType;

    if (type === 'points_of_interest') {
      this._singularLocationType = 'Point of Interest';
    } else if (type === 'trail_segments') {
      this._singularLocationType = 'Trail Segment';
    } else {
      this._singularLocationType = type.charAt(0).toUpperCase() + type.slice(1, type.length - 1);
    }

    type = this._singularLocationType;

    if (this.options.searchable) {
      options.search = function (value) {
        var layers = this.L._layers;
        var re = new RegExp(value, 'i');
        var results = [];

        for (var key in layers) {
          var layer = layers[key];

          if (layers.hasOwnProperty(key) && layer.hasOwnProperty('feature')) {
            if (re.test(layer.feature.properties.name)) {
              if (layer.feature.geometry.type.toLowerCase() === 'point') {
                results.push({
                  bounds: null,
                  latLng: layer.getLatLng(),
                  name: layers[key].feature.properties.name,
                  type: type
                });
              } else {
                results.push({
                  bounds: layer.getBounds(),
                  latLng: null,
                  name: layers[key].feature.properties.name,
                  type: type
                });
              }
            }
          }
        }

        return results;
      };
    }

    me = this;

    reqwest({
      error: function (error) {
        var obj = L.extend(error, {
          message: 'There was an error loading the data from OuterSpatial.'
        });

        me.fire('error', obj);
        me.errorFired = obj;
      },
      success: function (response) {
        var obj;

        if (response && response.responseText) {
          var geojson = JSON.parse(response.responseText);

          if (me.options.formatPopups) {
            me._collapseFeatureAttributes(geojson.features);
          }

          L.GeoJSON.prototype.initialize.call(me, geojson, me.options);
          me.fire('ready');
          me._loaded = true;
          me.readyFired = true;
        } else {
          obj = {
            message: 'There was an error loading the data from OuterSpatial.'
          };

          me.fire('error', obj);
          me.errorFired = obj;
        }

        return me;
      },
      url: 'https://' + (me.options.environment === 'production' ? '' : 'staging-') + 'cdn.outerspatial.com/static_data/organizations/' + me.options.organizationId + '/api_v2/' + me.options.locationType + '.geojson'
    });
  },
  onAdd: function (map) {
    this._map = map;
    this._addAttribution();

    if (this.options.zoomToBounds) {
      this.on('ready', function () {
        map.fitBounds(this.getBounds());
      });
    }

    if (this.options.formatPopups) {
      var config;
      var type = this._singularLocationType;

      if (this.options.popup) {
        config = this.options.popup;
      } else {
        config = {};
      }

      if (!config.title && !config.description) {
        config.title = function (properties) {
          if (type === 'Area') {
            return '{{name}}</br><span class="subtitle">Area</span>';
          } else {
            return '{{name}}</br><span class="subtitle">' + type + (properties.area_id ? ' in ' + properties.area.name + '</span>' : '</span>');
          }
        };

        config.image = function (properties) {
          if (properties.image_attachments.length > 0) {
            if (window.innerWidth <= 320) {
              return properties.image_attachments[0].image.versions.small_square.url;
            } else {
              return properties.image_attachments[0].image.versions.medium_square.url;
            }
          } else {
            return null;
          }
        };

        config.description = function (properties) {
          var address = properties.address;
          var content = '';
          var description = properties.description;
          var length = properties.length;
          var website = properties.website;

          if (description && description !== '' && description !== null) {
            content = content + '<section>' + description + '</section>';
          }

          if (length && length !== '' && length !== null) {
            content = content + '<section><span class="section-heading">Trail Length</span></br>' + (length / 1609.34).toFixed(1) + ' mi</section>';
          }

          if (address && address !== '' && address !== null) {
            try {
              address = JSON.parse(address).label;
            } catch (e) {
              // address is not JSON
            }

            content = content + '<section><span class="section-heading">' + properties.class_name + ' Address</span></br>' + address + '</section>';
          }

          if (website && website !== '' && website !== null) {
            content = content + '<section><span class="section-heading">Website</span></br><a href="' + properties.website + '" target="_blank">' + properties.website + '</section>';
          }

          if (content === '') {
            return null;
          } else {
            return content;
          }
        };
      }

      this.options.popup = config;
      L.Util.setOptions(this, this._toLeaflet(this.options));
    }

    L.GeoJSON.prototype.onAdd.call(this, map);

    return this;
  },
  _collapseFeatureAttributes: function (features) {
    features.forEach(function (feature) {
      var area = feature.properties.area;
      var tags = feature.properties.tags;
      var contentBlocks = feature.properties.content_blocks;

      if (area !== null) {
        for (var prop in area) {
          if (
            prop === 'address' ||
            prop === 'name' ||
            prop === 'area_type' ||
            prop === 'created_at' ||
            prop === 'description' ||
            prop === 'id' ||
            prop === 'updated_at' ||
            prop === 'slug' ||
            prop === 'phone_number' ||
            prop === 'website' ||
            prop === 'logo_image_id'
          ) {
            feature.properties['area:' + prop] = area[prop];
          }
        }
      }

      tags.forEach(function (tag) {
        tag.categories.forEach(function (category) {
          feature.properties['tag:' + category.name + ':' + tag.key] = tag.value;
        });
      });

      if (contentBlocks) {
        contentBlocks.forEach(function (contentBlock) {
          feature.properties['contentBlock:' + contentBlock.title] = contentBlock.body;
        });
      }
    });
  }
});

module.exports = function (options) {
  options = options || {};

  if (!options.type) {
    options.type = 'geojson';
  }

  if (options.cluster) {
    return L.outerspatial.layer._cluster(options);
  } else {
    return new OuterSpatialLayer(options);
  }
};
