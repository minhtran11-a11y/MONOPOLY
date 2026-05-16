const TILE_TYPES = {
    START: 'START',
    PROPERTY: 'PROPERTY',
    RAILROAD: 'RAILROAD',
    UTILITY: 'UTILITY',
    CHEST: 'CHEST',
    CHANCE: 'CHANCE',
    TAX: 'TAX',
    JAIL: 'JAIL',
    PARKING: 'PARKING',
    GOTOJAIL: 'GOTOJAIL'
};

const COLORS = {
    BROWN: 0x955436,
    LBLUE: 0xAAE0FA,
    PINK: 0xD93A96,
    ORANGE: 0xF7941D,
    RED: 0xED1C24,
    YELLOW: 0xFEF200,
    GREEN: 0x1FB25A,
    DBLUE: 0x0072BB,
    SPECIAL: 0xFFFFFF,
    TAX: 0xEEEEEE,
    UTIL: 0xBDD6E6,
    RAIL: 0x000000
};

const PLAYER_COLORS = [0xef4444, 0xfacc15, 0x3b82f6, 0x22c55e]; // Red, Yellow, Blue, Green
const PLAYER_HEX = ['#ef4444', '#facc15', '#3b82f6', '#22c55e'];

const GAME_CONFIG = {
    START_MONEY: 1500,
    PASS_GO_MONEY: 200,
    JAIL_EXIT_FEE: 50,
    MAX_HOUSES: 5 // 5 means Hotel
};
