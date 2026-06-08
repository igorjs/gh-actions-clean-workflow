'use strict';

const { readdirSync, readFileSync, existsSync } = require('fs');
const { join, resolve, relative } = require('path');
const { fileURLToPath } = require('url');

const v8ToIstanbul = require('v8-to-istanbul');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const TEMP_DIR = resolve('coverage/tmp');
const CWD = process.cwd();

function shouldInclude(absPath) {
  const rel = relative(CWD, absPath).replace(/\\/g, '/');
  if (!rel.startsWith('src/') || !rel.endsWith('.ts')) return false;
  if (rel.endsWith('.d.ts')) return false;
  if (rel.endsWith('.test.ts')) return false;
  if (rel.endsWith('.spec.ts')) return false;
  if (rel === 'src/config/types.ts') return false;
  return true;
}

async function run() {
  const coverageMap = createCoverageMap({});

  for (const file of readdirSync(TEMP_DIR).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(TEMP_DIR, file), 'utf8'));

    for (const sc of data.result || []) {
      const url = sc.url || '';
      if (!url.startsWith('file://')) continue;

      let absPath;
      try {
        absPath = fileURLToPath(url.split('?')[0]);
      } catch {
        continue;
      }

      if (!shouldInclude(absPath) || !existsSync(absPath)) continue;

      try {
        const source = readFileSync(absPath, 'utf8');
        const converter = v8ToIstanbul(absPath, 0, { source });
        await converter.load();
        converter.applyCoverage(sc.functions);
        coverageMap.merge(converter.toIstanbul());
      } catch {
        // skip files that can't be processed
      }
    }
  }

  const context = createContext({ dir: resolve('coverage'), coverageMap });

  for (const reporter of ['text', 'lcov', 'html']) {
    reports.create(reporter).execute(context);
  }

  const summary = coverageMap.getCoverageSummary();
  const thresholds = { lines: 90, functions: 90, branches: 85, statements: 90 };

  let failed = false;
  for (const [key, threshold] of Object.entries(thresholds)) {
    const pct = summary[key] ? summary[key].pct : 0;
    if (pct < threshold) {
      console.error(`Coverage threshold not met: ${key} ${pct}% < ${threshold}%`);
      failed = true;
    }
  }

  if (failed) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
