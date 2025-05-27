import { mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { unzipGtfs } from './gtfs-helpers.js';
import generateLocalTransitBounds from './generate-local-transit-bounds.js';
import generateRouteLineClippingLookupTables from './generate-route-line-clipping-lookup-tables.js';
import generateRouteTiles from './generate-route-tiles.js';

/*
 * This script generates two assets from the GTFS zip file. 
 * These assets are used in bikehopper-web-app to expose some data from the GTFS files.
 * The assets are:
 *  1. transit-service-area.json: 
 *     A rough GeoJSON polygon describing the area served transit in the GTFS
 *  2. route-line-lookup.json:
 *     Lookup tables that provide easy lookups for locations of transit stops, 
 *     route LineString shapes, and extra information for clipping route LineStrings between two stops.
 */

const requiredGTFSFiles = new Set(['routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt', 'shapes.txt']);
const ENV_FILTERED_AGENCY_IDS = process.env.FILTERED_AGENCY_IDS || '';
const ENV_MANUALLY_FILTERED_ROUTE_IDS = process.env.MANUALLY_FILTERED_ROUTE_IDS || '';

(async () => {
  // Initialize temprary folders to hold gtfs files
  const gtfsFilePath = resolve(process.env.GTFS_ZIP_PATH);
  const outputPath = resolve(process.env.OUTPUT_DIR_PATH);
  const gtfsOutputPath =  await mkdtemp(join(tmpdir(), 'gtfs-'));

  // decompress GTFS zip
  await unzipGtfs(gtfsFilePath, gtfsOutputPath, requiredGTFSFiles);

  // Generate transit-service-area.json
  await generateLocalTransitBounds(
    gtfsOutputPath, 
    ENV_FILTERED_AGENCY_IDS, 
    ENV_MANUALLY_FILTERED_ROUTE_IDS,
    outputPath
  );

  console.log(`Finished writing transit-service-area.json to: ${outputPath}`)
  
  // Generate route-line-lookup.json
  const routelineLookups = await generateRouteLineClippingLookupTables(gtfsOutputPath);
  const { routeTripShapeLookup, shapeIdLineStringLookup, tripIdStopIdsLookup } = routelineLookups;

  // Write the JSON dictionaries to disk so we can use it in bikehopper-web-app at request time for fast lookups
  await writeFile(
    resolve(outputPath, 'route-line-lookup.json'),
    JSON.stringify({
      routeTripShapeLookup,
      shapeIdLineStringLookup,
      tripIdStopIdsLookup,
    }),
    'utf8',
  );

  console.log(`Finished writing route-line-lookup.json to: ${outputPath}`)

  await generateRouteTiles(
    routelineLookups,
    gtfsOutputPath,
    outputPath,
  );

  console.log(`Finished writing /route-tiles to: ${outputPath}`)
})();
