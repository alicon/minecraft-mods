'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Shared atomic writer also preserves a completed failed report if world reset fails afterward.
function saveReport(reportFile, report) {
  if (!reportFile) return;
  const target = path.resolve(reportFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(`${target}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(`${target}.tmp`, target);
}

// Persist after every case, including setup errors and partial runs. A long case can use its third run argument to checkpoint observations.
async function runCases(cases, { reportFile, metadata = {}, capture = async () => null, onResult = () => {}, afterSuccess }) {
  const report = { ...metadata, requestedCaseCount: cases.length, ok: false, complete: false, startedAt: new Date().toISOString(), cases: [] };
  const save = () => saveReport(reportFile, report);
  save();
  for (const scenario of cases) {
    const result = { name: scenario.name, inputs: scenario.inputs, status: 'running' };
    report.cases.push(result);
    save();
    let phase = 'setup';
    try {
      const fixture = await scenario.setup();
      phase = 'assertion';
      result.observed = await scenario.run(fixture, result, save);
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
    // Keep failed investigative actors available instead of replacing their fixture.
    if (scenario.stopOnFailure && result.status !== 'passed' && report.cases.length < cases.length) {
      report.stoppedAfterFailure = true;
      break;
    }
  }
  report.gameplayComplete = report.cases.length === cases.length;
  report.summary = {};
  for (const result of report.cases) report.summary[result.status] = (report.summary[result.status] || 0) + 1;
  report.gameplayOk = report.gameplayComplete && report.cases.length > 0 && report.cases.every((result) => result.status === 'passed');
  if (afterSuccess) {
    report.postRun = { status: report.gameplayOk ? 'running' : 'skipped', startedAt: new Date().toISOString() };
    // Persist the original verdicts before any success-only maintenance. Completion still waits for maintenance.
    save();
    if (report.gameplayOk) {
      try {
        report.postRun.observed = await afterSuccess();
        report.postRun.status = report.postRun.observed?.skipped ? 'skipped' : 'passed';
        if (report.postRun.observed?.skipped) report.postRun.reason = report.postRun.observed.reason;
      }
      catch (error) {
        report.postRun.status = 'failed'; report.postRun.error = error.message;
        if (error.observed) report.postRun.observed = error.observed;
      }
    } else report.postRun.reason = 'gameplay_failed';
    report.postRun.finishedAt = new Date().toISOString();
  }
  report.ok = report.gameplayOk && report.postRun?.status !== 'failed';
  report.complete = true;
  report.finishedAt = new Date().toISOString();
  save();
  return report;
}

module.exports = { runCases, saveReport };
