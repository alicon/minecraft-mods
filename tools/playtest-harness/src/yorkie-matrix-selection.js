'use strict';

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');

function selectionFor(cases, { seed, limit, priorReport }) {
  if (seed === undefined && limit === undefined && priorReport === undefined) {
    return { cases, plan: undefined };
  }
  const parsedSeed = seed === undefined ? 0 : integer(seed, 0, 0xffffffff, 'seed');
  const count = limit === undefined ? cases.length : integer(limit, 1, cases.length, 'limit');
  const ranked = [...cases];
  let state = parsedSeed;
  if (seed !== undefined || priorReport !== undefined) {
    for (let index = ranked.length - 1; index > 0; index--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const other = state % (index + 1);
      [ranked[index], ranked[other]] = [ranked[other], ranked[index]];
    }
  }
  let previous;
  if (priorReport !== undefined) {
    if (typeof priorReport !== 'string') throw new Error('Supply a previous matrix report path');
    const bytes = readFileSync(priorReport);
    const report = JSON.parse(bytes);
    if (report.scenario !== 'yorkie-matrix' || !Array.isArray(report.cases)) {
      throw new Error('Prior report must be a yorkie-matrix result');
    }
    // A fixture or cleanup failure gives no information about gameplay behavior.
    const findings = report.cases.filter(result => result.status === 'failed' && result.inputs);
    const scores = new Map(ranked.map(candidate => [
      candidate.name,
      Math.max(0, ...findings.map(result => similarity(candidate, result))),
    ]));
    ranked.sort((a, b) => scores.get(b.name) - scores.get(a.name));
    previous = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      findings: findings.map(result => result.name),
    };
  }
  const selected = ranked.slice(0, count);
  return {
    cases: selected,
    plan: { seed: parsedSeed, priorReport: previous, order: selected.map(candidate => candidate.name) },
  };
}

function integer(value, min, max, label) {
  const number = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`--${label} must be an integer from ${min} through ${max}`);
  }
  return number;
}

function similarity(candidate, result) {
  if (candidate.name === result.name) return 2;
  const inputs = Object.entries(candidate.inputs || {});
  if (inputs.length === 0) return 0;
  const shared = inputs.filter(([key, value]) => Object.hasOwn(result.inputs, key) && result.inputs[key] === value);
  return shared.length / Math.max(inputs.length, Object.keys(result.inputs).length);
}

module.exports = { selectionFor };
