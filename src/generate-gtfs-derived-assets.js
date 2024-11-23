const { createReadStream, readFileSync } = require('node:fs');
const { writeFile, mkdtemp } = require('node:fs/promises');
const turfConvex = require('@turf/convex').default;
const turfBuffer = require('@turf/buffer').default;
const { flattenStopRoutes } = require('./stop-and-route-lookup-helper');
const { getDistanceAlongLookup } = require('./distance-along-lookup-helper');
const { resolve, join } = require("path");
const { tmpdir } = require('node:os');
const { filterRouteIds, filterTripIds, getInterestingStopIds, getInterestingStopsAsGeoJsonPoints, unzipGtfs } = require('./gtfs-helpers');
const { parse } = require('csv-parse');

/*
 * This script generates two assets from the GTFS zip file. 
 * These assets are used in bikehopper-web-app to expose some data from the GTFS files.
 * The assets are:
 *  1. transit-service-area.json: 
 *     A rough GeoJSON polygon describing the area served transit in the GTFS
 *  2. route-line-lookup.json
 *     Lookup tables that provide easy lookups for locations of transit stops, 
 *     route LineString shapes, and extra information for clipping route LineStrings between two stops.
 */

const requiredGTFSFiles = new Set(['routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt']);
const ENV_FILTERED_AGENCY_IDS = process.env.FILTERED_AGENCY_IDS || '';
const ENV_MANUALLY_FILTERED_ROUTE_IDS = process.env.MANUALLY_FILTERED_ROUTE_IDS || '';

(async () => {
  /* 
   * PART 1: Computing transit-service-area.json
   *
   * This part computes a polygon to define the "transit service area". The
   * purpose for this is, if your instance supports streets routing over a wider
   * geographical area than you have local transit information for, to warn your
   * user if local transit options relevant to their journey might be missing.
   *
   * The approach is to compute a buffered hull around all the transit stops,
   * excluding some stops that are filtered out by route ID or agency ID.
   */


  // Initialize temprary folders to hold gtfs files
  const gtfsFilePath = resolve(process.env.GTFS_ZIP_PATH);
  const gtfsOutputPath =  await mkdtemp(join(tmpdir(), 'gtfs-'));

  // decompress GTFS zip
  await unzipGtfs(gtfsFilePath, gtfsOutputPath, requiredGTFSFiles);

  /*
   * When computing the transit service area, we want to only include stops
   * served by *local* transit, and not by intra-city services. For example,
   * the flagship BikeHopper instance, at the time of writing, supports
   * streets routing for all of Northern California, but has GTFS data only
   * for the SF Bay Area, except that we do have GTFS data for the Amtrak
   * Capitol Corridor route, which would cause this script to include
   * Sacramento, if we did not filter Capitol Corridor. Filtering out transit
   * stops both by agency ID and by route ID is supported.
   */
  const FILTERED_AGENCY_IDS = new Set(ENV_FILTERED_AGENCY_IDS.split(','));
  const MANUALLY_FILTERED_ROUTE_IDS = new Set(ENV_MANUALLY_FILTERED_ROUTE_IDS.split(','));

  const routesReadableStream = createReadStream(resolve(gtfsOutputPath, `routes.txt`), {encoding: 'utf8'});
  const filteredRouteIds = await filterRouteIds(FILTERED_AGENCY_IDS, MANUALLY_FILTERED_ROUTE_IDS, routesReadableStream);

  const tripsReadableStream = createReadStream(resolve(gtfsOutputPath, `trips.txt`), {encoding: 'utf8'})
  const filteredTripIds = await filterTripIds(filteredRouteIds, tripsReadableStream);

  // now we do things a little backwards... instead of the set of all filtered
  // stops, we build a set of all interesting stops. that is because if a stop
  // is served both by a filtered agency AND a local transit agency, then we
  // want to include it.
  let stopTimesReadableStream = createReadStream(resolve(gtfsOutputPath, `stop_times.txt`), {encoding: 'utf8'})
  const interestingStopIds = await getInterestingStopIds(filteredTripIds, stopTimesReadableStream);

  // and now just aggregate all the interesting stop IDs as GeoJSON
  const stopsReadableStream = createReadStream(resolve(gtfsOutputPath, `stops.txt`), {encoding: 'utf8'});
  const interestingStopsAsGeoJsonPoints = await getInterestingStopsAsGeoJsonPoints(interestingStopIds, stopsReadableStream);

  const interestingStopsCollection = {
    type: 'FeatureCollection',
    features: interestingStopsAsGeoJsonPoints,
  };

  const convexHull = turfConvex(interestingStopsCollection);
  const bufferedHull = turfBuffer(convexHull, 5, {units: 'miles'});

  const outputPath = resolve(process.env.OUTPUT_DIR_PATH);

  await writeFile(
    resolve(outputPath, 'transit-service-area.json'),
    JSON.stringify(bufferedHull, null, 2),
    'utf8',
  );

  stopsReadableStream.close();
  
  console.log(`Finished writing transit-service-area.json to: ${outputPath}`)

   /* 
   * PART 2: Computing route-line-lookup.json
   *
   * This part computes three lookup tables:
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
   */
  const gtfsToGeoJSON = await import('gtfs-to-geojson');
  const agencies = [
    {
      agency_key: 'RG',
      path: gtfsFilePath,
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

  stopTimesReadableStream = createReadStream(resolve(gtfsOutputPath, `stop_times.txt`), {encoding: 'utf8'});
  const parser = stopTimesReadableStream.pipe(parse());

  // Lookup tables for clipping LineStrings
  const distanceAlongLookup = await getDistanceAlongLookup(parser);
  
  const routlineLookups = {
    stopIdPointLookup,
    routeIdLineStringLookup,
    distanceAlongLookup,
  };

  await writeFile(
    resolve(outputPath, 'route-line-lookup.json'),
    JSON.stringify(routlineLookups, null, 2),
    'utf8',
  );
})();
