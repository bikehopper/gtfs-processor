const { createReadStream, existsSync } = require('node:fs');
const { appendFile, unlink, rm } = require('node:fs/promises');
const { resolve, join } = require("path");
const { parse } = require('csv-parse');
const { lineString } = require('@turf/helpers');
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

async function generateRouteTiles(
  routelineLookups,
  unzippedGtfsPath,
  outputPath,
) {
  const routesStream = createReadStream(resolve(unzippedGtfsPath, 'routes.txt'), {encoding: 'utf8'});
  const parser = routesStream.pipe(parse({columns: true}));

  const ldGeoJsonPath = join(outputPath, 'routelines.ldgeojson');
  if (existsSync(ldGeoJsonPath)) {
    await unlink(ldGeoJsonPath);
  }
  
  console.log('Staring creation of routeline LDGeoJSON');
  for await(const route of parser) {
    await appendRouteLineStringToFile(route, ldGeoJsonPath, routelineLookups);
  }
  console.log('Finished creating LDGeoJSON for all routelines');

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
