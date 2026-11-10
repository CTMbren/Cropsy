import { defineConfig } from 'vitest/config';

// `npm run sim` prints the simulated pacing timeline.
export default defineConfig({ test: { include: ['tests/sim.test.ts'], environment: 'node' } });
