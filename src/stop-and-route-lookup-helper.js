const turf = require('@turf/helpers');

function flattenStopRoutes(geojson) {
  const stopIdPointLookup = {};
  const routeIdLineStringLookup = {};

  for(const feature of geojson.features){
    if(feature.geometry.type === 'Point'){
      const stopId = feature.properties['stop_id'];
      if (stopId) {
        const point = turf.point(feature.geometry.coordinates);
        stopIdPointLookup[stopId] = point
      }
    } else if(feature.geometry.type === 'LineString') {
      const routeId = feature.properties.route_id;
      if (routeId) {
        const lineString = turf.lineString(feature.geometry.coordinates);
        routeIdLineStringLookup[routeId] = lineString;
      }
    }
  }

  return {stopIdPointLookup, routeIdLineStringLookup};
}

module.exports = {
  flattenStopRoutes,
};