import { readFileSync } from 'node:fs';
import { createPosition } from './simulator.js';
import { analyze } from './search.js';
import { analyzeRequest } from './api.js';

try {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: npm run analyze -- path/to/position.json');
  const input = JSON.parse(readFileSync(path, 'utf8'));
  if (input.schemaVersion !== undefined) {
    console.log(JSON.stringify(analyzeRequest(input), null, 2));
  } else {
    const battle = createPosition(input);
    try { console.log(JSON.stringify(analyze(battle, input.search), null, 2)); }
    finally { battle.destroy(); }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
