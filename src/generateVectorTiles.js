const path = require('path');
const fs = require('fs');
const geojson2mvt = require('geojson2mvt');

import('gtfs-to-geojson').then((gtfsToGeoJSON) => {
  const agencies = [
    {
      agency_key: 'RG',
      // Input GTFS file path
      path: path.join(__dirname, '../gtfs/GTFSTransitData_RG.zip'),
    }
  ];

  // This is a hardcoded temp geojson file thats an intermediary
  const outputGeojsonPath = path.join(process.cwd(), '/geojson/RG/RG.geojson');
  
  const options = {
    layerName: 'layer0',
    rootDir: './tiles',
    bbox: [
      36.61398006570329,
      -123.83095440232262,
      39.21353032569155,
      -120.83959624268564,
    ], //[south,west,north,east]
    zoom: {
      min: 7,
      max: 15,
    }
  };
  
  
  return gtfsToGeoJSON({
    agencies,
    outputType: 'agency',
    outputFormat: 'lines-and-stops',
    ignoreDuplicates: true,
  });
  
}).then(() => {
  console.log('geojson generated');
  const geojson = JSON.parse(fs.readFileSync(outputGeojsonPath, {encoding: 'utf-8'}));
  debugger;

  // /tiles output director gets generated at cwd
  geojson2mvt(geojson, options);
});
