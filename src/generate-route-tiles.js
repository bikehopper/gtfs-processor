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
 * Appends all the stops to the LDGeoJson file
 * 
 * @param {*} stopsParser 
 * @param {*} ldGeoJsonPath 
 */
async function appendStops(stopsParser, ldGeoJsonPath) {
  for await(const stop of stopsParser) {
    const stopId = stop['stop_id'];
    const stopName = stop['stop_name'];
    const lat = parseFloat(stop['stop_lat']);
    const lon = parseFloat(stop['stop_lon']);

    if (!isNaN(lat) && !isNaN(lon) && !!stopId) {
      const geojson = point([lon, lat], {
        stop_name: stopName,
        stop_id: stopId,
      });

      await appendFile(ldGeoJsonPath, JSON.stringify(geojson)+'\n');
    }
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
  await appendStops(stopsParser, ldGeoJsonPath);

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
