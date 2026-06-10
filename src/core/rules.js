// --- GAME RULES HELPERS (rent, buildables) ---
// Previously referenced by game.js / ui.js but never defined. Adding them
// here makes the game logic actually functional.

// Standard simplified Monopoly rent multipliers.
const RENT_TABLE = {
    houses: [1, 5, 15, 45, 80],   // index 0=no houses, 4=4 houses
    hotel: 125
};

const RAILROAD_RENT = [0, 25, 50, 100, 200]; // by count owned

function _ownsAllInGroup(tile, players) {
    if (!tile || tile.owner === null || tile.groupId === undefined) return false;
    const groupTiles = boardData.filter(t => t.groupId === tile.groupId);
    if (groupTiles.length === 0) return false;
    return groupTiles.every(t => t.owner === tile.owner);
}

function calculateRent(tile, diceTotal) {
    if (!tile) return 0;
    if (tile.owner === null || tile.owner === undefined) return 0;
    if (tile.isMortgaged) return 0;

    if (tile.type === TILE_TYPES.RAILROAD) {
        const count = boardData.filter(t => t.type === TILE_TYPES.RAILROAD && t.owner === tile.owner).length;
        return RAILROAD_RENT[count] || 0;
    }
    if (tile.type === TILE_TYPES.UTILITY) {
        const count = boardData.filter(t => t.type === TILE_TYPES.UTILITY && t.owner === tile.owner).length;
        const mult = count >= 2 ? 10 : 4;
        // diceTotal may not be available at every call site; fall back to flat rent.
        return (diceTotal && diceTotal > 0) ? diceTotal * mult : (tile.rent || 0);
    }
    if (tile.type !== TILE_TYPES.PROPERTY) return 0;

    const base = tile.rent || 0;
    if (tile.houses === 5) return base * RENT_TABLE.hotel;
    if (tile.houses > 0)   return base * RENT_TABLE.houses[tile.houses];
    // No houses: doubled if owner has the full color group
    const monopoly = _ownsAllInGroup(tile, window.players);
    return monopoly ? base * 2 : base;
}

function getBuildableProperties(playerId) {
    const owned = boardData.filter(t =>
        t.owner === playerId &&
        t.type === TILE_TYPES.PROPERTY &&
        !t.isMortgaged
    );
    // Group by groupId
    const groups = {};
    owned.forEach(t => {
        if (!groups[t.groupId]) groups[t.groupId] = [];
        groups[t.groupId].push(t);
    });
    const result = [];
    Object.keys(groups).forEach(gid => {
        const groupTiles = boardData.filter(t => t.groupId === Number(gid));
        // Player must own ALL tiles in this group (a monopoly), none mortgaged.
        const ownsAll = groupTiles.every(t => t.owner === playerId && !t.isMortgaged);
        if (!ownsAll) return;
        // Build evenly: only allow tiles with the minimum house count to receive a new house.
        const minHouses = Math.min(...groupTiles.map(t => t.houses));
        groupTiles.forEach(t => {
            if (t.houses < 5 && t.houses === minHouses) result.push(t);
        });
    });
    // Sort cheapest first so AI prefers low-cost builds
    result.sort((a, b) => a.houseCost - b.houseCost);
    return result;
}

// Expose as globals (some callers use bare names, others Game.*)
window.calculateRent = calculateRent; // LEGACY-BRIDGE
window.getBuildableProperties = getBuildableProperties; // LEGACY-BRIDGE
// Wire Game.getBuildableProperties so ui.js's defensive check resolves to our impl.
if (typeof Game !== 'undefined') Game.getBuildableProperties = getBuildableProperties;

window._ownsAllInGroup = _ownsAllInGroup; // LEGACY-BRIDGE

export { calculateRent, getBuildableProperties };
