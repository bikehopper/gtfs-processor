const { writeFile } = require('node:fs/promises');
const { getRouteTripShapeLookup } = require('./get-route-id-trip-id-shape-id-lookup');
const { getShapesLookup } = require('./get-shapes-lookup');
const { getStopsForTripLookup } = require('./get-trip-id-stop-ids-lookup');
const { resolve } = require("path");

/**
 * Computes 3 lookup tables:
 * 1. stopTripShapeLookup: 
 *    This is a two-level dictionary
 *    Level1 :
 *    Key is a stop-id, Value is the 2nd Level dictionary
 *       Level 2:
 *       Key is a trip-id, Value is a shape-id
 * 2. shapeIdLineStringLookup:
 *    Key is the shape-id of a route, and the value is a LineString of the entire route
 * 3. tripIdStopIdsLookup:
 *    Key is a trip-id, and value is an array of stop-ids for that trip
 *
 * stopTripShapeLookup and shapeIdLineStringLookup provide enough information to generate a LineString for a
 * trip thats clipped between the entry and exit stops. 
 *
 * @param {string} unzippedGtfsPath path to unzipped gtfs text files
 * @param {string} outputPath path to directory in which generated file is dumped into
 * @return {Object} {
 *    stopTripShapeLookup: {<route-id, trip-id> : <shape-id>}, 
 *    shapeIdLineStringLookup: {<shape-id> : <LineString>},
 *    tripIdStopIdsLookup: {<trip-id>: <stop-id[]>},
 *    tripRouteLookup: Map<<trip-id> : Set<route-id>>,
 *    stopIdTripIdsLookup: Map<<stop-id> : Set<<trip-id>>,
 * }
 */
async function generateRouteLineClippingLookupTables(
  unzippedGtfsPath,
  outputPath,
) {

  console.log('Starting build of routeline clipping tables');
  const {routeTripShapeLookup: stopTripShapeLookup, tripRouteLookup} = await getRouteTripShapeLookup(unzippedGtfsPath);
  console.log('Built <route-id, trip-id> : <shape-id> table');

  const shapeIdLineStringLookup = await getShapesLookup(unzippedGtfsPath);
  console.log('Built <shape-id> : <LineString> table');

  const { tripIdStopIdsLookup, stopIdTripIdsLookup } = await getStopsForTripLookup(unzippedGtfsPath);
  console.log('Built <trip-id> : <stop-id[]> table');

  // Write the JSON dictionaries to disk so we can use it in bikehopper-web-app at request time for fast lookups
  await writeFile(
    resolve(outputPath, 'route-line-lookup.json'),
    JSON.stringify({
      stopTripShapeLookup,
      shapeIdLineStringLookup,
      tripIdStopIdsLookup,
    }),
    'utf8',
  );

  return {
    stopTripShapeLookup,
    shapeIdLineStringLookup,
    tripIdStopIdsLookup,
    tripRouteLookup,
    stopIdTripIdsLookup,
  };
};

module.exports = {
  generateRouteLineClippingLookupTables,
};
