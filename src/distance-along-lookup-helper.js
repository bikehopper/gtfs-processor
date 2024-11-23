async function getDistanceAlongLookup(parsedStopTimesReadStream) {
  const distanceAlongLookup = {};
  for await (const stopCsv of parsedStopTimesReadStream) {
    const stopId = stopCsv['stop_id'];
    const tripId = stopCsv['trip_id'];
    const distanceAlong = parseFloat(stopCsv['shape_dist_traveled']);

    if (!isNaN(distanceAlong) && stopId && tripId){
      // Lazily init the first level in the dictionary
      if (distanceAlongLookup[stopId] == null) {
        distanceAlongLookup[stopId] = {};
      }
      distanceAlongLookup[stopId][tripId] = distanceAlong;
    }
  }

  return distanceAlongLookup;
}

module.exports = {
  getDistanceAlongLookup,
};