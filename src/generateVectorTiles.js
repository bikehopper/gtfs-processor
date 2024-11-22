const path = require('path');
const fs = require('fs');
const bbox = require('@turf/bbox').default;
const turf = require('@turf/helpers');
const { tmpdir } = require('node:os');
const { unzipGtfs } = require('./gtfs-helpers');
const { createReadStream } = require('node:fs');
const { parse } = require('csv-parse');
const { mkdtemp } = require('node:fs/promises');

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

(async () => {
  const gtfsToGeoJSON = await import('gtfs-to-geojson');

  const agencies = [
    {
      agency_key: 'RG',
      // Input GTFS file path
      path: resolve(process.env.GTFS_ZIP_PATH),
    }
  ];
  
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

  // /dicts 
  const rootDir = resolve(process.env.OUTPUT_DIR_PATH);;
  const linesStringsPath = path.join(rootDir, 'route-id-line-string-lookup.json');
  const stopIdLocationsPath = path.join(rootDir, 'stop-id-point-lookup.json');
  const distanceAlongDictPath = path.join(rootDir, 'distance-along-lookup.json');

  const gtfsOutputPath = await mkdtemp(path.join(tmpdir(), 'gtfs-'));
  await unzipGtfs(agencies[0].path, gtfsOutputPath, new Set(['stop_times.txt']));

  const stopTimesReadableStream = createReadStream(path.resolve(gtfsOutputPath, `stop_times.txt`), {encoding: 'utf8'});
  const parser = stopTimesReadableStream.pipe(parse());

  let rowIdx = 0;
  let stopIdIdx = 0;
  let tripIdIdx = 0;
  let distanceAlongIdx = 0;
  const distanceAlongDict = {};
  for await (const stopCsv of parser) {
    if (rowIdx === 0) {
      stopIdIdx = stopCsv.indexOf('stop_id');
      tripIdIdx = stopCsv.indexOf('trip_id');
      distanceAlongIdx = stopCsv.indexOf('shape_dist_traveled');
    } else {
      const stopId = stopCsv[stopIdIdx];
      const tripId = stopCsv[tripIdIdx];
      const distanceAlong = parseFloat(stopCsv[distanceAlongIdx]);

      if (!isNaN(distanceAlong) && stopId != null && stopId.length > 0 && tripId != null && tripId.length > 0){
        distanceAlongDict[`${stopId}|${tripId}`] = distanceAlong;
      }
    }

    rowIdx++;
  }

  if(!fs.existsSync(rootDir)){
    fs.mkdirSync(rootDir);
  }
  fs.writeFileSync(linesStringsPath, JSON.stringify(routeIdLineStringDict, null, 2),  {encoding: 'utf-8'});
  fs.writeFileSync(stopIdLocationsPath, JSON.stringify(stopIdPointDict, null, 2),  {encoding: 'utf-8'});
  fs.writeFileSync(distanceAlongDictPath, JSON.stringify(distanceAlongDict, null, 2),  {encoding: 'utf-8'});
})();
