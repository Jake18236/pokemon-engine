import { parentPort } from 'node:worker_threads';
import { runCommand } from './engine.js';

parentPort.on('message', ({ id, command }) => {
  try { parentPort.postMessage({ id, result: runCommand(command) }); }
  catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
