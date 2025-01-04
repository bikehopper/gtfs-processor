const { createReadStream, existsSync } = require('node:fs');
const { appendFile, unlink, rm } = require('node:fs/promises');
const { resolve, join } = require("path");
const { parse } = require('csv-parse');
const { lineString, point } = require('@turf/helpers');
const shell = require('shelljs');


/**
 * Given a row of route, finds the corresponding shapes from the shapes lookup tables.
 * Then appends the shape into a line-delimited geojson file as a LineString.
 * 
 * @param {Object} route Route object parsed from a row of `routes.txt`
 * @param {string} ldGeoJsonPath filepath to the LDGeoJSON file for output features
 * @param {Object} routelineLookups Lookup table for shapes
 */
async function appendRouteLineStringToFile(
  route,
  ldGeoJsonPath,
  routelineLookups, 
) {
  const { stopTripShapeLookup, shapeIdLineStringLookup } = routelineLookups;

  const routeId = route['route_id'];
  const routeColor = route['route_color'];
  const routeTextColor = route['route_text_color'];

  const trips = stopTripShapeLookup[routeId];
  if (trips) {
    const seenShapes = new Map();
    for (const tripId of Object.keys(trips)) {
      const shapeId = trips[tripId];
      const shape = shapeIdLineStringLookup[shapeId];
      if (shape) {
        if (!seenShapes.has(shapeId)) {
          // First time seeing this shape, so create the GeoJSON lineString
          const geojson = lineString(shape, {
            route_id: routeId,
            trip_ids: tripId, // comma-seperated list of trip-ids, MVT doesn't support arrays
            route_color: `#${routeColor}`,
            route_text_color: `#${routeTextColor}`,
          });
          seenShapes.set(shapeId, geojson);
        } else {
          // Seeing the same again, but for different trip, so add this trip-id to its trip_ids prop
          const geojson = seenShapes.get(shapeId);   
          geojson.properties.trip_ids += `,${tripId}`;
        }
      }
    }
    
    for(const routeLineString of seenShapes.values()) {
      await appendFile(ldGeoJsonPath, JSON.stringify(routeLineString)+'\n');
    }
  }
}

/**
 * Creates a Map<stop_id, GeoJsonPoint>
 * 
 * @param {*} stopsParser 
 * @returns {Map}
 */
async function getStopsMap(stopsParser) {
  const stopsMap = new Map();
  for await(const stop of stopsParser) {
    const stopId = stop['stop_id'];
    const stopName = stop['stop_name'];
    const lat = parseFloat(stop['stop_lat']);
    const lon = parseFloat(stop['stop_lon']);

    if (!isNaN(lat) && !isNaN(lon) && !!stopId) {
      const geojson = point([lon, lat], {
        stop_name: stopName,
        trip_ids: new Set(), // Use Set to de-dup
        stop_id: stopId,
      });
      stopsMap.set(stopId, geojson);
    }
  }

  return stopsMap;
}

/**
 * Loops over `stop_times.txt` and populates the `trip_ids` Set with trip-ids fro the stop.
 * Mutates the points within `stopsMap` in-place.
 * 
 * @param {*} stopTimesParser 
 * @param {Map} stopsMap 
 */
async function addTripsToStops(stopTimesParser, stopsMap){
  for await (const stopTime of stopTimesParser) {
    const stopId = stopTime['stop_id'];
    const tripId = stopTime['trip_id'];

    if (stopsMap.has(stopId)) {
      const stopGeojson = stopsMap.get(stopId);
      if (!!tripId) {
        stopGeojson.properties.trip_ids.add(tripId);
      }
    }
  }
} 

/**
 * Appends all the stops in `stopsMap` to the LDGeoJSON file.
 * 
 * @param {string} ldGeoJsonPath 
 * @param {Map} stopsMap 
 */
async function addStopsToFile(ldGeoJsonPath, stopsMap){
  for (const stopGeoJson of stopsMap.values()){
    // replace Set with comma separated string
    stopGeoJson.properties.trip_ids = Array.from(stopGeoJson.properties.trip_ids).join(',');
    await appendFile(ldGeoJsonPath, JSON.stringify(stopGeoJson)+'\n');
  }
}

async function generateRouteTiles(
  routelineLookups,
  unzippedGtfsPath,
  outputPath,
) {
  
  const ldGeoJsonPath = join(outputPath, 'routelines.ldgeojson');
  if (existsSync(ldGeoJsonPath)) {
    await unlink(ldGeoJsonPath);
  }
  
  console.log('Staring creation of LDGeoJSON');
  const routesStream = createReadStream(resolve(unzippedGtfsPath, 'routes.txt'), {encoding: 'utf8'});
  const routesParser = routesStream.pipe(parse({columns: true}));
  for await(const route of routesParser) {
    await appendRouteLineStringToFile(route, ldGeoJsonPath, routelineLookups);
  }
  console.log('Finished adding route LineStrings LDGeoJSON');

  const stopsStream = createReadStream(resolve(unzippedGtfsPath, 'stops.txt'), {encoding: 'utf8'});
  const stopsParser = stopsStream.pipe(parse({columns: true}));
  const stopsMap = await getStopsMap(stopsParser);

  const stopTimesStream = createReadStream(resolve(unzippedGtfsPath, 'stop_times.txt'), {encoding: 'utf8'});
  const stopTimesParser = stopTimesStream.pipe(parse({columns: true}));
  await addTripsToStops(stopTimesParser, stopsMap);
  await addStopsToFile(ldGeoJsonPath, stopsMap);
  console.log('Finished addings stop points to LDGeoJSON');

  if (!shell.which('tippecanoe')) {
    throw new Error('tippecanoe is not installed and available on PATH');
  }
  const tilesPath = join(outputPath, 'route-tiles');
  if (existsSync(tilesPath)) {
    await rm(tilesPath, {recursive: true});
  }

  const tippecanoeCommand = `tippecanoe \
   -e ${tilesPath} \
   -l route-lines \
   -P -Z7 -pC -pk \
   ${ldGeoJsonPath}`;
  
  const result = shell.exec(tippecanoeCommand);
  if (result.code !== 0) {
    throw new Error('Tippecanoe failed to tile');
  }
}

module.exports = {
  generateRouteTiles,
};
