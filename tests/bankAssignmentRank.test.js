// Run with:  node --test tests/bankAssignmentRank.test.js
const test = require('node:test');
const assert = require('node:assert');
const { rankAccounts } = require('../utils/bankAssignmentRank');

const acc = (bankId, dayTotal, lastAssignedAt = null) => ({ bankId, dayTotal, lastAssignedAt });
const ids = (list) => list.map((a) => a.bankId);

// The worked example from the design document: five accounts, range total well above Rs 50,000
test('spread over 20% leaves out the accounts above lowest + 20% of the highest', () => {
    const accounts = [
        acc(1, 240000, 5), acc(2, 210000, 4), acc(3, 195000, 3), acc(4, 160000, 2), acc(5, 150000, 1),
    ];
    const total = 240000 + 210000 + 195000 + 160000 + 150000;
    // highest 240,000, lowest 150,000: gap 90,000 > 48,000; cutoff 198,000 -> A3, A4, A5 stay
    assert.deepStrictEqual(ids(rankAccounts(accounts, total)), [5, 4, 3]);
});

test('the account assigned longest ago comes first, never-assigned before all', () => {
    const accounts = [acc(1, 100, 30), acc(2, 100, 10), acc(3, 100, null), acc(4, 100, 20)];
    assert.deepStrictEqual(ids(rankAccounts(accounts, 400)), [3, 2, 4, 1]);
});

test('ties on last assigned are broken by account id', () => {
    assert.deepStrictEqual(ids(rankAccounts([acc(9, 0, 5), acc(2, 0, 5), acc(5, 0, 5)], 0)), [2, 5, 9]);
});

test('same last-assigned moment: the less loaded account comes first', () => {
    assert.deepStrictEqual(ids(rankAccounts([acc(1, 900, 5), acc(2, 100, 5), acc(3, 500, 5)], 1500, { minVolume: 1e9 })), [2, 3, 1]);
});

test('below the minimum volume the rule is off', () => {
    const accounts = [acc(1, 40000, 2), acc(2, 0, 1)]; // huge spread but only Rs 40,000 in total
    assert.deepStrictEqual(ids(rankAccounts(accounts, 40000)), [2, 1]);
});

test('exactly at the minimum volume the rule applies', () => {
    const accounts = [acc(1, 50000, 2), acc(2, 0, 1)];
    assert.deepStrictEqual(ids(rankAccounts(accounts, 50000)), [2]);
});

test('a gap of exactly 20% of the highest keeps everyone', () => {
    const accounts = [acc(1, 100000, 2), acc(2, 80000, 1)];
    assert.deepStrictEqual(ids(rankAccounts(accounts, 180000)), [2, 1]);
});

test('a gap just over 20% leaves out the highest', () => {
    const accounts = [acc(1, 100000, 1), acc(2, 79999, 2)];
    assert.deepStrictEqual(ids(rankAccounts(accounts, 179999)), [2]);
});

test('the lowest account is always eligible, so the result is never empty', () => {
    for (let i = 0; i < 200; i++) {
        const accounts = Array.from({ length: 1 + (i % 7) }, (_, n) => acc(n + 1, Math.floor(Math.random() * 300000), n));
        const total = accounts.reduce((s, a) => s + a.dayTotal, 0);
        assert.ok(rankAccounts(accounts, total).length >= 1);
    }
});

test('one account, no accounts, other percentages', () => {
    assert.deepStrictEqual(ids(rankAccounts([acc(7, 123456)], 123456)), [7]);
    assert.deepStrictEqual(rankAccounts([], 0), []);
    const accounts = [acc(1, 100000, 1), acc(2, 85000, 2)];
    assert.deepStrictEqual(ids(rankAccounts(accounts, 185000, { balancePercent: 10 })), [2]);
    assert.deepStrictEqual(ids(rankAccounts(accounts, 185000, { balancePercent: 20 })), [1, 2]);
});

test('amounts with paise are compared exactly', () => {
    const accounts = [acc(1, 0.1 + 0.2, 1), acc(2, 0.3, 2)];
    assert.deepStrictEqual(ids(rankAccounts(accounts, 0.6, { minVolume: 0 })), [1, 2]);
});

test('input is not modified', () => {
    const accounts = [acc(2, 5, 2), acc(1, 5, 1)];
    const copy = JSON.stringify(accounts);
    rankAccounts(accounts, 10);
    assert.strictEqual(JSON.stringify(accounts), copy);
});
