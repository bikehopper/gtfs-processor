const { readFile } = require('node:fs/promises');
const { join } = require("path");
const bbox = require('@turf/bbox').default;
const geojson2mvt = require('geojson2mvt');

// Converts the `routes` property on a stop point to a comma-separated string
// Mutates the input geojson in-place
// We do this because the final VectorTile protobufs do not support arrays for feature properties
function stopRoutesToCSVInPlace(geojson) {
  for(const feature of geojson.features){
    if(feature.geometry.type === 'Point'){
      const routes = feature.properties.routes;
      feature.properties['route_ids'] = routes.map((route) => route.route_id).join(',');
      delete feature.properties.routes;
    } 
  }
}

async function generateRouteTiles(
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

  // gtfsToGeoJSON has this hardcoded path that it outputs the gtfs file too
  const outputGeojsonPath = join(process.cwd(), '/geojson/RG/RG.geojson');

  const geojson = JSON.parse(await readFile(outputGeojsonPath, {encoding: 'utf-8'}));
  stopRoutesToCSVInPlace(geojson);
  const boundingBox = bbox(geojson);
  const tilingOptions = {
    layerName: 'layer0',
    rootDir: join(outputPath, 'route-tiles'),
    bbox: [
      boundingBox[1],
      boundingBox[0],
      boundingBox[3],
      boundingBox[2],
    ], //[south,west,north,east]
    zoom: {
      min: 7,
      max: 14,
    }
  };

  geojson2mvt(geojson, tilingOptions);
}

module.exports = {
  generateRouteTiles,
};
