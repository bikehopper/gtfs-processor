function getDistanceAlongLookup(parsedStopTimesReadStream) {
  let rowIdx = 0;
  let stopIdIdx = 0;
  let tripIdIdx = 0;
  let distanceAlongIdx = 0;
  const distanceAlongLookup = {};
  for await (const stopCsv of parsedStopTimesReadStream) {
    if (rowIdx === 0) {
      stopIdIdx = stopCsv.indexOf('stop_id');
      tripIdIdx = stopCsv.indexOf('trip_id');
      distanceAlongIdx = stopCsv.indexOf('shape_dist_traveled');
    } else {
      const stopId = stopCsv[stopIdIdx];
      const tripId = stopCsv[tripIdIdx];
      const distanceAlong = parseFloat(stopCsv[distanceAlongIdx]);

      if (!isNaN(distanceAlong) && stopId != null && stopId.length > 0 && tripId != null && tripId.length > 0){
        distanceAlongLookup[`${stopId}|${tripId}`] = distanceAlong;
      }
    }

    rowIdx++;
  }

  return distanceAlongLookup;
}

module.exports = {
  getDistanceAlongLookup,
};