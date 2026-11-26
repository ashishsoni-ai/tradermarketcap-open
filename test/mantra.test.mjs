import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { readSupply } from '../collector/sources/chainsupply.mjs';

function mockServer(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise(r => srv.close(r)) });
    });
  });
}

test('mantra: reads amantra total supply (18 decimals), community pool, and withholds circulating', async () => {
  const srv = await mockServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/cosmos/bank/v1beta1/supply/by_denom?denom=amantra')) {
      return res.end(JSON.stringify({ amount: { denom: 'amantra', amount: '8417603420000000000000000000' } }));
    }
    if (req.url.startsWith('/cosmos/distribution/v1beta1/community_pool')) {
      return res.end(JSON.stringify({ pool: [{ denom: 'amantra', amount: '18115924000000000000000000.0' }] }));
    }
    res.statusCode = 404;
    res.end('{}');
  });

  try {
    const coins = JSON.parse(readFileSync(new URL('../data-seed/coins.json', import.meta.url), 'utf8'));
    const rule = { ...coins.mantra.supply, lcd: srv.url };
    const out = await readSupply(rule);
    assert.equal(out.total, 8417603420);
    assert.equal(out.circulating, null);
    assert.equal(out.excluded.length, 1);
    assert.equal(out.excluded[0].amount, 18115924);
  } finally {
    await srv.close();
  }
});

test('mantra: fails closed on HTTP error or NaN supply', async () => {
  const srv = await mockServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ amount: { denom: 'amantra', amount: 'not-a-number' } }));
  });

  try {
    await assert.rejects(
      () => readSupply({ method: 'cosmos', lcd: srv.url, denom: 'amantra', decimals: 18, circulating: false }),
      /bad cosmos total supply/
    );
  } finally {
    await srv.close();
  }
});
