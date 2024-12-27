const { createReadStream, existsSync } = require('node:fs');
const { appendFile, unlink, rm } = require('node:fs/promises');
const { resolve, join } = require("path");
const { parse } = require('csv-parse');
const { multiLineString } = require('@turf/helpers');
const shell = require('shelljs');

async function generateRouteTiles(
  routelineLookups,
  unzippedGtfsPath,
  outputPath,
) {
  const { stopTripShapeLookup, shapeIdLineStringLookup } = routelineLookups;

  const routesStream = createReadStream(resolve(unzippedGtfsPath, 'routes.txt'), {encoding: 'utf8'});
  const parser = routesStream.pipe(parse({columns: true}));

  const ldGeoJsonPath = join(outputPath, 'routelines.ldgeojson');
  if (existsSync(ldGeoJsonPath)) {
    await unlink(ldGeoJsonPath);
  }
  
  console.log('Staring creation of routeline LDGeoJSON');
  for await(const route of parser) {
    const routeId = route['route_id'];
    const routeColor = route['route_color'];
    const routeTextColor = route['route_text_color'];

    const trips = stopTripShapeLookup[routeId];
    if (trips) {
      const shapes = Object.values(trips).map((shapeId) => shapeIdLineStringLookup[shapeId]);
      const routeLineString = multiLineString(shapes, {
        route_id: routeId,
        route_color: routeColor,
        route_text_color: routeTextColor,
      });
      
      await appendFile(ldGeoJsonPath, JSON.stringify(routeLineString)+'\n');
    }
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
