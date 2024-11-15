const { createReadStream, createWriteStream } = require('node:fs');
const { writeFile, mkdtemp, rm } = require('node:fs/promises');
const turfConvex = require('@turf/convex').default;
const turfBuffer = require('@turf/buffer').default;
const unzipper = require("unzipper");
const { resolve, join, basename} = require("path");
const { tmpdir } = require('node:os');
const { filterRouteIds, filterTripIds, getInterestingStopIds, getInterestingStopsAsGeoJsonPoints } = require('./gtfs-helpers');

/*
 * This script computes a polygon to define the "transit service area". The
 * purpose for this is, if your instance supports streets routing over a wider
 * geographical area than you have local transit information for, to warn your
 * user if local transit options relevant to their journey might be missing.
 *
 * The approach is to compute a buffered hull around all the transit stops,
 * excluding some stops that are filtered out by route ID or agency ID.
 */

const requiredGTFSFiles = new Set(['routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt']);
const ENV_FILTERED_AGENCY_IDS = process.env.FILTERED_AGENCY_IDS || '';
const ENV_MANUALLY_FILTERED_ROUTE_IDS = process.env.MANUALLY_FILTERED_ROUTE_IDS || '';

async function unzip(src, dest) {
  const zip = createReadStream(src).pipe(unzipper.Parse({forceStream: true}));
  for await (const entry of zip) {
    const fileName = basename(entry.path);
    if (requiredGTFSFiles.has(fileName)) {
      entry.pipe(createWriteStream(join(dest, fileName)));
    } else {
      entry.autodrain();
    }
  }
}

(async () => {
  // Initialize temprary folders to hold gtfs files
  const gtfsFilePath = resolve(process.env.GTFS_ZIP_PATH);
  const gtfsOutputPath =  await mkdtemp(join(tmpdir(), 'gtfs-'));

  await unzip(gtfsFilePath, gtfsOutputPath);

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
  const stopTimesReadableStream = createReadStream(resolve(gtfsOutputPath, `stop_times.txt`), {encoding: 'utf8'})
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

  console.log(`Finished writing output files to: ${outputPath}`);
})();
