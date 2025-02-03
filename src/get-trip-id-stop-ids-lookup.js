const { createReadStream } = require('node:fs');
const { resolve } = require("path");
const { parse } = require('csv-parse');


/**
 * Loops over `stop_times.txt` and generates a lookup table, where the key is a trip-id,
 * and the value is an Array of stop-ids on that trip.
 * 
 * @param {*} unzippedGtfsPath 
 * @returns {Object} <trip-id>: <stop-id>[]
 */
async function getStopsForTripLookup(unzippedGtfsPath){
  const stopTimesStream = createReadStream(resolve(unzippedGtfsPath, 'stop_times.txt'), {encoding: 'utf8'});
  const parser = stopTimesStream.pipe(parse({columns: true}));
  const lookupTable = {};
  for await (const stopTime of parser) {
    const stopId = stopTime['stop_id'];
    const tripId = stopTime['trip_id'];
    if (tripId && stopId) {
      // Use a set to de-dup stop-ids
      if (lookupTable[tripId] == null) {
        lookupTable[tripId] = new Set();
      }
      lookupTable[tripId].add(stopId);
    }
  }

  // Convert all the Set(s) to Array(s) so we have JSON in lookupTable
  for (const tripId of Object.keys(lookupTable)) {
    const stopsList = Array.from(lookupTable[tripId]);
    lookupTable[tripId] = stopsList;
  }

  return lookupTable;
}

module.exports = {
  getStopsForTripLookup,
};
