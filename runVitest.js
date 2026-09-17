import { s as runVitest } from 'https://esm.sh/vitest@5.0.1/es2022/dist/chunks/run.C5UmxDPh.mjs';

// Rest of your workerContext and execution logic remains identical:
const workerContext = {
  config: {
    root: '/',
    globals: true,
    environment: 'browser',
    passWithNoTests: true,
    includeTaskLocation: false,
    maxConcurrency: 5,
    testTimeout: 5000,
    hookTimeout: 10000,
    retry: 0,
    repeats: 0,
    strictTags: false,
    tags: [],
    sequence: {
      concurrent: false,
      shuffle: false,
      hooks: 'parallel',
      setupFiles: [],
      seed: 123
    },
    _diffOptions: {}
  },
  pool: 'browser',
  viteEnvironment: 'client',
  
  async importFile(filepath, type) {
    console.log(`[Vitest Engine] Importing file: ${filepath} (${type})`);
    return await import(filepath);
  },

  trace: async (name, metadata, fn) => await fn(),
  onCollected: (files) => {
    console.log('🧪 Vitest Collected Files:', files);
  },
  onTaskUpdate: (tasks) => {},
  onAfterRunTask: (test) => {
    const state = test.result.state;
    const icon = state === 'pass' ? '✔' : state === 'fail' ? '✖' : 'ℹ';
    console.log(`  ${icon} ${test.name} (${test.result.duration || 0}ms)`);
    if (test.result.errors?.length) {
      console.error(test.result.errors);
    }
  }
};

try {
  console.log('🚀 Starting real Vitest engine...');
  await runVitest(['/math.test.js'], workerContext);
  console.log('✨ Vitest execution complete.');
} catch (err) {
    console.error('💥 Vitest runner failed:', err);
}
