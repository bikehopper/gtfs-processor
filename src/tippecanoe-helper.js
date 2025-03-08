const { spawn } = require('node:child_process');
const shell = require('shelljs');

async function runTippecanoe(
  inputLDGeoJsonPath,
  tilesOutputPath,
  vectorLayerName,
  minZoom,
  shouldSimplifyLines,
  dontDropPoints
) {
  return new Promise((resolve, reject) => {
    if (!shell.which('tippecanoe')) {
      reject(new Error('tippecanoe is not installed and available on PATH'));
    }

    const params = ['-e', tilesOutputPath, '-l', vectorLayerName, '-P', `-Z${minZoom}`];
    if (shouldSimplifyLines) {
      params.push('-S', '15');
    }
    if (dontDropPoints) {
      params.push('-r', '0', '-g', '0');
    }
    params.push(inputLDGeoJsonPath);

    console.log(`Running tippecanoe ${params.join(' ')}`);
    try {
      const proc = spawn('tippecanoe', params);
      proc.stdout.on('data', (data) => {
        console.log(`${data}`);
      });
      
      proc.stderr.on('data', (data) => {
        console.log(`${data}`);
      });
      
      proc.on('close', (code) => {
        if(code !== 0) {
          reject(new Error(`Tippecanoe failed to tile ${vectorLayerName}`));
        } else {
          resolve();
        }
      });
    } catch (e) {
      console.log(e);
      reject(e);
    }
  });
}

module.exports = {
  runTippecanoe,
};