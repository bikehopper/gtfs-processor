const turf = require('@turf/helpers');

function flattenStopRoutes(geojson) {
  const stopIdPointLookup = {};
  const routeIdLineStringLookup = {};

  for(const feature of geojson.features){
    if(feature.geometry.type === 'Point'){
      const routes = feature.properties.routes;
      feature.properties['route_ids'] = routes.map((route) => route.route_id).join(',');
      delete feature.properties.routes;

      const stopId = feature.properties['stop_id'];
      if (stopId && stopId.length > 0 ) {
        const point = turf.point(feature.geometry.coordinates);
        stopIdPointLookup[stopId] = point
      }
    } else if(feature.geometry.type === 'LineString') {
      const routeId = feature.properties.route_id;
      if (routeId && routeId.length > 0) {
        const lineString = turf.lineString(feature.geometry.coordinates);
        routeIdLineStringLookup[routeId] = lineString;
      }
    }
  }

  return {stopIdPointLookup, routeIdLineStringLookup};
}

module.exports = {
  flattenStopRoutes,
}