'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Persist after every case, including setup errors and partial runs.
async function runCases(cases, { reportFile, metadata = {}, capture = async () => null, onResult = () => {} }) {
  const report = { ...metadata, ok: false, complete: false, startedAt: new Date().toISOString(), cases: [] };
  function save() {
    if (!reportFile) return;
    const target = path.resolve(reportFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(`${target}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
    fs.renameSync(`${target}.tmp`, target);
  }
  save();
  for (const scenario of cases) {
    const result = { name: scenario.name, inputs: scenario.inputs, status: 'running' };
    report.cases.push(result);
    save();
    let phase = 'setup';
    try {
      const fixture = await scenario.setup();
      phase = 'assertion';
      result.observed = await scenario.run(fixture, result);
      result.status = 'passed';
    } catch (error) {
      result.status = phase === 'setup' || error.phase === 'setup' ? 'setup_failed' : 'failed';
      result.error = error.message;
      try { result.evidence = await capture(scenario, error); }
      catch (captureError) { result.captureError = captureError.message; }
    } finally {
      if (scenario.cleanup) {
        try { await scenario.cleanup(); }
        catch (error) { result.cleanupError = error.message; result.status = 'cleanup_failed'; }
      }
      save();
    }
    onResult(result);
  }
  report.complete = true;
  report.finishedAt = new Date().toISOString();
  report.summary = {};
  for (const result of report.cases) report.summary[result.status] = (report.summary[result.status] || 0) + 1;
  report.ok = report.cases.length > 0 && report.cases.every((result) => result.status === 'passed');
  save();
  return report;
}

module.exports = { runCases };
