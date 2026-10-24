#!/usr/bin/env node
'use strict';

// Read-only probe of the public endpoint used by SportsService. No database,
// wallet, credentials, or background settlement services are loaded.
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const ENDPOINT = 'https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket';

function options(argv) {
  const result = { samples: 1, intervalMs: 10000, output: null, matchId: null };
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`Missing value for ${argv[i]}`);
    switch (argv[i]) {
      case '--samples': result.samples = Number(value); break;
      case '--interval-ms': result.intervalMs = Number(value); break;
      case '--output': result.output = path.resolve(value); break;
      case '--match-id': result.matchId = value; break;
      default: throw new Error(`Unknown option: ${argv[i]}`);
    }
  }
  if (!Number.isInteger(result.samples) || result.samples < 1 || result.samples > 61) {
    throw new Error('--samples must be an integer from 1 to 61');
  }
  if (!Number.isInteger(result.intervalMs) || result.intervalMs < 5000 || result.intervalMs > 60000) {
    throw new Error('--interval-ms must be an integer from 5000 to 60000');
  }
  if (result.matchId !== null && !/^\d+$/.test(result.matchId)) {
    throw new Error('--match-id must be a numeric ESPN match ID');
  }
  return result;
}

function fetchSnapshot() {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const request = https.get(ENDPOINT, {
      headers: { 'User-Agent': 'MoneyGame-Feed-Diagnostic/1.0', Accept: 'application/json' },
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 5_000_000) request.destroy(new Error('Response exceeds probe size limit'));
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
        try {
          resolve({
            data: JSON.parse(body),
            httpStatus: response.statusCode,
            responseTimeMs: Math.round(performance.now() - startedAt),
            headers: {
              date: response.headers.date ?? null,
              age: response.headers.age ?? null,
              cacheControl: response.headers['cache-control'] ?? null,
              lastModified: response.headers['last-modified'] ?? null,
            },
          });
        } catch { reject(new Error('Endpoint did not return valid JSON')); }
      });
    });
    const deadline = setTimeout(() => request.destroy(new Error('Request deadline exceeded')), 20000);
    request.on('close', () => clearTimeout(deadline));
    request.on('error', reject);
  });
}

function summarize(data) {
  if (!Array.isArray(data.sports)) throw new Error('Unexpected response: sports is not an array');
  return data.sports.flatMap(sport => (sport.leagues ?? []).flatMap(league =>
    (league.events ?? []).map(event => ({
      id: String(event.id),
      league: league.name,
      name: event.name,
      status: event.status,
      summary: event.summary,
      date: event.date,
      period: event.period,
      clock: event.clock,
      fullStatus: event.fullStatus,
      capabilities: {
        playByPlayAvailable: event.playByPlayAvailable ?? null,
        commentaryAvailable: event.commentaryAvailable ?? null,
        updatesOnly: event.updatesOnly ?? null,
      },
      eventKeys: Object.keys(event),
      links: event.links,
      competitors: (event.competitors ?? []).map(team => ({
        id: team.id,
        name: team.displayName || team.name,
        score: team.score ?? null,
        winner: team.winner ?? null,
        keys: Object.keys(team),
      })),
    }))));
}

async function main() {
  const config = options(process.argv.slice(2));
  const report = {
    endpoint: ENDPOINT,
    startedAt: new Date().toISOString(),
    configuration: config,
    limitations: [
      'Measures observed scoreboard snapshots, not independently verified delivery completeness or source latency.',
      'HTTP response time and cache headers do not establish the time elapsed since a real delivery.',
      'Provider availability flags are not delivery records in this response.',
      'Bypasses MoneyGame\'s 45-second cache to inspect the upstream feed directly.',
    ],
    samples: [],
  };
  const previous = new Map();
  for (let i = 0; i < config.samples; i++) {
    const started = performance.now();
    const sample = { observedAt: new Date().toISOString() };
    try {
      const { data, ...metadata } = await fetchSnapshot();
      sample.receivedAt = new Date().toISOString();
      Object.assign(sample, metadata);
      const matches = summarize(data);
      sample.totalMatches = matches.length;
      sample.matches = config.matchId ? matches.filter(match => match.id === config.matchId) : matches;
      sample.changes = [];
      for (const match of sample.matches) {
        const score = match.competitors.map(team => ({ name: team.name, score: team.score }));
        const state = { status: match.status, summary: match.summary, score };
        const before = previous.get(match.id);
        if (before && JSON.stringify(before) !== JSON.stringify(state)) {
          sample.changes.push({ id: match.id, name: match.name, before, after: state });
        }
        previous.set(match.id, state);
      }
      console.log(JSON.stringify({ sample: i + 1, at: sample.receivedAt,
        httpStatus: sample.httpStatus, responseTimeMs: sample.responseTimeMs,
        matches: sample.matches.length,
        live: sample.matches.filter(match => match.status === 'in').length,
        scored: sample.matches.filter(match => match.competitors.some(team => team.score)).length,
        selectedMatch: config.matchId ? sample.matches.map(match => ({ id: match.id,
          name: match.name, status: match.status, scores: match.competitors.map(team => team.score) })) : undefined,
        changes: sample.changes }));
    } catch (error) {
      sample.error = error.code || error.message;
      console.log(JSON.stringify({ sample: i + 1, at: sample.observedAt, error: sample.error }));
    }
    report.samples.push(sample);
    report.finishedAt = new Date().toISOString();
    if (config.output) fs.writeFileSync(config.output, JSON.stringify(report, null, 2) + '\n');
    if (i + 1 < config.samples) {
      await new Promise(resolve => setTimeout(resolve, Math.max(0, config.intervalMs - (performance.now() - started))));
    }
  }
  const successful = report.samples.filter(sample => sample.httpStatus === 200).length;
  const targetPresentSamples = config.matchId
    ? report.samples.filter(sample => sample.matches?.length).length : null;
  console.log(JSON.stringify({ completed: true, successful, attempted: config.samples,
    targetPresentSamples,
    changedSnapshots: report.samples.filter(sample => sample.changes?.length).length,
    output: config.output }));
  if (successful !== config.samples || (config.matchId && targetPresentSamples !== config.samples)) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
