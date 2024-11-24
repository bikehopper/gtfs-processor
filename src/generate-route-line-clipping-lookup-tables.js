const { createReadStream, readFileSync } = require('node:fs');
const { writeFile } = require('node:fs/promises');
const { getStopAndRouteLookups } = require('./stop-and-route-lookup-helper');
const { getDistanceAlongLookup } = require('./distance-along-lookup-helper');
const { resolve, join } = require("path");
const { parse } = require('csv-parse');

/**
 * Computes three lookup tables:
 * 1. stopIdPointLookup: 
 *    Key is the stop-id of the stop, and the Value is a GeoJSON point of the stops location
 * 2. routeIdLineStringLookup:
 *    Key is the route-id of a route, and the value is a GeoJSON LineString of the entire route
 * 3. distanceAlongLookup:
 *    This is a two-level dictionary
 *    Level1 :
 *    Key is a stop-id, Value is the 2nd Level dictionary
 *       Level 2:
 *       Key is a trip-id, Value is how far along the LineString the stop is for that trip.
 *
 * These three lookup tables frovide enough information to generate a LineString for a
 * trip thats clipped between the entry and exit stops. 
 *
 * @param {string} unzippedGtfsPath path to unzipped gtfs text files
 * @param {string} zippedGtfsPath path to zipped gtfs file
 * @param {string} outputPath path to directory in which generated file is dumped into
 */
async function generateRouteLineClippingLookupTables(
  unzippedGtfsPath,
  zippedGtfsPath,
  outputPath,
) {
  const gtfsToGeoJSON = await import('gtfs-to-geojson');
  const agencies = [
    {
      agency_key: 'RG',
      path: zippedGtfsPath,
    }
  ];
  await gtfsToGeoJSON.default({
    agencies,
    outputType: 'agency',
    outputFormat: 'lines-and-stops',
    ignoreDuplicates: true,
  });

  // 'gtfs-to-geojson' library generates the geojson from the GTFS into this path, we read it in here
  const outputGeojsonPath = join(process.cwd(), '/geojson/RG/RG.geojson');
  const geojson = JSON.parse(readFileSync(outputGeojsonPath, {encoding: 'utf-8'}));

  // Lookup tables for stop-points and route linestrings
  const {stopIdPointLookup, routeIdLineStringLookup} = getStopAndRouteLookups(geojson);

  const stopTimesReadableStream = createReadStream(resolve(unzippedGtfsPath, `stop_times.txt`), {encoding: 'utf8'});
  const parser = stopTimesReadableStream.pipe(parse({columns: true}));

  // Lookup tables for clipping LineStrings
  const distanceAlongLookup = await getDistanceAlongLookup(parser);
  
  const routlineLookups = {
    stopIdPointLookup,
    routeIdLineStringLookup,
    distanceAlongLookup,
  };

  await writeFile(
    resolve(outputPath, 'route-line-lookup.json'),
    JSON.stringify(routlineLookups),
    'utf8',
  );

  stopTimesReadableStream.close();
};

module.exports = {
  generateRouteLineClippingLookupTables,
};
