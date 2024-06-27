const path = require('path');
const fs = require('fs');
const geojson2mvt = require('geojson2mvt');
const bbox = require('@turf/bbox').default;

import('gtfs-to-geojson').then((gtfsToGeoJSON) => {
  const agencies = [
    {
      agency_key: 'RG',
      // Input GTFS file path
      path: path.join(__dirname, '../gtfs/GTFSTransitData_RG.zip'),
    }
  ];
  
  return gtfsToGeoJSON.default({
    agencies,
    outputType: 'agency',
    outputFormat: 'lines-and-stops',
    ignoreDuplicates: true,
  });
}).then(() => {
  console.log('geojson generated');
  // This is a hardcoded temp geojson file thats an intermediary
  const outputGeojsonPath = path.join(process.cwd(), '/geojson/RG/RG.geojson');
  
  const geojson = JSON.parse(fs.readFileSync(outputGeojsonPath, {encoding: 'utf-8'}));
  const boundingBox = bbox(geojson);
  const options = {
    layerName: 'layer0',
    rootDir: './tiles',
    bbox: [
      boundingBox[1],
      boundingBox[0],
      boundingBox[3],
      boundingBox[2],
    ], //[south,west,north,east]
    zoom: {
      min: 7,
      max: 15,
    }
  };

  // /tiles output director gets generated at cwd
  geojson2mvt(geojson, options);
});
