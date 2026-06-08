'use strict';

const { Report } = require('c8');

(async () => {
  const report = new Report({
    tempDirectory: 'coverage/tmp',
    reporter: ['text', 'lcov', 'html'],
    include: ['src/**/*.ts'],
    exclude: [
      'src/**/*.d.ts',
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'src/config/types.ts',
    ],
    all: true,
    src: [process.cwd()],
    cwd: process.cwd(),
    thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
  });
  await report.run();
})();
