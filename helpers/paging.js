// Page number and page size from a query string, as safe whole numbers.
// perPage is capped so one request can never ask for a whole table.
function parsePaging(query = {}, { defaultPerPage = 10, maxPerPage = 100 } = {}) {
    const perPage = Math.min(Math.max(parseInt(query.perPage, 10) || defaultPerPage, 1), maxPerPage);
    const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), 100000);
    return { page, perPage };
}

module.exports = { parsePaging };
