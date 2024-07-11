const path = require('path');
const fs = require('fs');
const geojson2mvt = require('geojson2mvt');
const bbox = require('@turf/bbox').default;
const turf = require('@turf/helpers');

const agencies = [
  {
    agency_key: 'RG',
    // Input GTFS file path
    path: path.join(__dirname, '../gtfs/GTFSTransitData_RG.zip'),
  }
];


function flattenStopRoutes(geojson) {
  const stopIdPointDict = {};
  const routeIdLineStringDict = {};

  for(const feature of geojson.features){
    if(feature.geometry.type === 'Point'){
      const routes = feature.properties.routes;
      feature.properties['route_ids'] = routes.map((route) => route.route_id).join(',');
      delete feature.properties.routes;

      const stopId = feature.properties['stop_id'];
      if (stopId && stopId.length > 0 ) {
        const point = turf.point(feature.geometry.coordinates);
        stopIdPointDict[stopId] = point
      }
    } else if(feature.geometry.type === 'LineString') {
      const routeId = feature.properties.route_id;
      if (routeId && routeId.length > 0) {
        const lineString = turf.lineString(feature.geometry.coordinates);
        routeIdLineStringDict[routeId] = lineString;
      }
    }
  }

  return {stopIdPointDict, routeIdLineStringDict};
}

const lineClippingDict = {};

(async () => {
  const gtfsToGeoJSON = await import('gtfs-to-geojson');
  
  await gtfsToGeoJSON.default({
    agencies,
    outputType: 'agency',
    outputFormat: 'lines-and-stops',
    ignoreDuplicates: true,
  });

  console.log('geojson generated');

  // This is a hardcoded temp geojson file thats an intermediary
  const outputGeojsonPath = path.join(process.cwd(), '/geojson/RG/RG.geojson');
  
  const geojson = JSON.parse(fs.readFileSync(outputGeojsonPath, {encoding: 'utf-8'}));
  const {stopIdPointDict, routeIdLineStringDict} = flattenStopRoutes(geojson);

  const boundingBox = bbox(geojson);
  const options = {
    layerName: 'layer0',
    rootDir: './tiles',
    bbox: [
      boundingBox[1],
      boundingBox[0],
      boundingBox[3],
      boundingBox[2],
    ], //[south,west,north,east]
    zoom: {
      min: 7,
      max: 15,
    }
  };

  // /tiles output director gets generated at cwd
  geojson2mvt(geojson, options);
})();
