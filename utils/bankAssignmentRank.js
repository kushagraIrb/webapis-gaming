// The "20% rule" that decides which of a range's usable bank accounts may be given to the next user.
// Pure function (no database): the assignment service feeds it the numbers and it is unit-tested on its own
// (tests/bankAssignmentRank.test.js).
//
// accounts: [{ bankId, dayTotal, lastAssignedAt }]
//   dayTotal        counted deposits of today + live holds, in rupees, of an account that is usable right now
//   lastAssignedAt  epoch milliseconds when the account was last given to a user, or null if never
// rangeTotal: day total of the whole range (every enabled account in it, usable or not)
// opts: { balancePercent (20), minVolume (50000) }
//
// Returns the accounts that may be offered, best first: the one assigned longest ago comes first.
// 1. Below the minimum volume the rule is off and every usable account is eligible.
// 2. Otherwise, if (highest - lowest) is more than balancePercent of the highest, accounts above
//    (lowest + balancePercent of the highest) are left out for new assignments.
// Money is compared in paise so 0.1 + 0.2 style rounding cannot flip a decision.

const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);

function rankAccounts(accounts, rangeTotal, opts = {}) {
    const balancePercent = Number.isFinite(Number(opts.balancePercent)) ? Number(opts.balancePercent) : 20;
    const minVolume = Number.isFinite(Number(opts.minVolume)) ? Number(opts.minVolume) : 50000;

    if (!Array.isArray(accounts) || accounts.length === 0) return [];

    const rows = accounts.map((a) => ({ ...a, paise: toPaise(a.dayTotal) }));
    let eligible = rows;

    if (toPaise(rangeTotal) >= toPaise(minVolume)) {
        const highest = Math.max(...rows.map((r) => r.paise));
        const lowest = Math.min(...rows.map((r) => r.paise));
        const allowedGap = (highest * balancePercent) / 100;
        if (highest - lowest > allowedGap) {
            const cutoff = lowest + allowedGap;
            eligible = rows.filter((r) => r.paise <= cutoff);
        }
    }

    return eligible
        .slice()
        .sort((a, b) => {
            const aTime = a.lastAssignedAt == null ? -Infinity : a.lastAssignedAt;
            const bTime = b.lastAssignedAt == null ? -Infinity : b.lastAssignedAt;
            if (aTime !== bTime) return aTime < bTime ? -1 : 1;
            if (a.paise !== b.paise) return a.paise - b.paise; // same moment: the less loaded account first
            return a.bankId - b.bankId;
        })
        .map(({ paise, ...rest }) => rest);
}

module.exports = { rankAccounts };
