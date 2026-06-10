// AUTO-COPIED from src/core — do not edit. Regenerate with: node scripts/sync-shared.mjs
/**
 * src/core/board.ts
 *
 * Pure, typed static data for the rules core. This is a faithful TypeScript
 * port of src/core/data.js (boardData), src/core/constants.js (GAME_CONFIG)
 * and the inline Chance ("Cơ Hội") / Chest ("Khí Vận") decks defined in
 * src/game/game.js handleCardDraw (~lines 340-409).
 *
 * IMPORTANT: zero imports beyond ./types — this module must run unchanged in
 * the browser and in Deno (Supabase Edge Functions). Do NOT import the
 * untyped .js modules from here.
 *
 * FIX-4 (pre-approved): the "airport director" Chance card no longer grants
 * silent ownership of tile 35; it is now a plain move-to-35-with-$500 card,
 * after which normal landing rules run.
 */

import type { CardDef, TileDef } from './types.ts';

// ---------------------------------------------------------------------------
// Config (constants.js GAME_CONFIG)
// ---------------------------------------------------------------------------

export const GAME_CONFIG = {
    START_MONEY: 1500,
    PASS_GO_MONEY: 200,
    JAIL_EXIT_FEE: 50,
    /** 5 means hotel. */
    MAX_HOUSES: 5
} as const;

export const BOARD_SIZE = 40;
export const JAIL_POSITION = 10;

// constants.js COLORS (board paint colors, 0xRRGGBB)
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
} as const;

// ---------------------------------------------------------------------------
// Board (data.js boardData — static fields only; owner/houses/isMortgaged
// are runtime state and live in GameState.tiles)
// ---------------------------------------------------------------------------

export const BOARD: readonly TileDef[] = [
    { id: 0, name: 'BẮT ĐẦU', type: 'START', color: COLORS.SPECIAL },
    { id: 1, name: 'Đ. Nguyễn Huệ', type: 'PROPERTY', price: 60, rent: 2, color: COLORS.BROWN, groupId: 1, houseCost: 50 },
    { id: 2, name: 'Khí Vận', type: 'CHEST', color: COLORS.SPECIAL },
    { id: 3, name: 'Đ. Lê Lợi', type: 'PROPERTY', price: 60, rent: 4, color: COLORS.BROWN, groupId: 1, houseCost: 50 },
    { id: 4, name: 'Thuế Thu Nhập', type: 'TAX', price: 200, color: COLORS.TAX },
    { id: 5, name: 'Ga Sài Gòn', type: 'RAILROAD', price: 200, rent: 25, color: COLORS.RAIL },
    { id: 6, name: 'Đ. Hai Bà Trưng', type: 'PROPERTY', price: 100, rent: 6, color: COLORS.LBLUE, groupId: 2, houseCost: 50 },
    { id: 7, name: 'Cơ Hội', type: 'CHANCE', color: COLORS.SPECIAL },
    { id: 8, name: 'Đ. Điện Biên Phủ', type: 'PROPERTY', price: 100, rent: 6, color: COLORS.LBLUE, groupId: 2, houseCost: 50 },
    { id: 9, name: 'Đ. Võ Thị Sáu', type: 'PROPERTY', price: 120, rent: 8, color: COLORS.LBLUE, groupId: 2, houseCost: 50 },
    { id: 10, name: 'THĂM TÙ', type: 'JAIL', color: COLORS.SPECIAL },
    { id: 11, name: 'Phố Cổ Hội An', type: 'PROPERTY', price: 140, rent: 10, color: COLORS.PINK, groupId: 3, houseCost: 100 },
    { id: 12, name: 'Công Ty Điện', type: 'UTILITY', price: 150, rent: 20, color: COLORS.UTIL },
    { id: 13, name: 'Đại Nội Huế', type: 'PROPERTY', price: 140, rent: 10, color: COLORS.PINK, groupId: 3, houseCost: 100 },
    { id: 14, name: 'Cầu Rồng', type: 'PROPERTY', price: 160, rent: 12, color: COLORS.PINK, groupId: 3, houseCost: 100 },
    { id: 15, name: 'Ga Đà Nẵng', type: 'RAILROAD', price: 200, rent: 25, color: COLORS.RAIL },
    { id: 16, name: 'Đ. Trần Phú', type: 'PROPERTY', price: 180, rent: 14, color: COLORS.ORANGE, groupId: 4, houseCost: 100 },
    { id: 17, name: 'Khí Vận', type: 'CHEST', color: COLORS.SPECIAL },
    { id: 18, name: 'Đ. Bạch Đằng', type: 'PROPERTY', price: 180, rent: 14, color: COLORS.ORANGE, groupId: 4, houseCost: 100 },
    { id: 19, name: 'Đ. Hùng Vương', type: 'PROPERTY', price: 200, rent: 16, color: COLORS.ORANGE, groupId: 4, houseCost: 100 },
    { id: 20, name: 'BÃI ĐẬU XE', type: 'PARKING', color: COLORS.SPECIAL },
    { id: 21, name: 'Đ. Tràng Tiền', type: 'PROPERTY', price: 220, rent: 18, color: COLORS.RED, groupId: 5, houseCost: 150 },
    { id: 22, name: 'Cơ Hội', type: 'CHANCE', color: COLORS.SPECIAL },
    { id: 23, name: 'Đ. Hàng Bài', type: 'PROPERTY', price: 220, rent: 18, color: COLORS.RED, groupId: 5, houseCost: 150 },
    { id: 24, name: 'Đ. Đinh Tiên Hoàng', type: 'PROPERTY', price: 240, rent: 20, color: COLORS.RED, groupId: 5, houseCost: 150 },
    { id: 25, name: 'Ga Hà Nội', type: 'RAILROAD', price: 200, rent: 25, color: COLORS.RAIL },
    { id: 26, name: 'Hồ Gươm', type: 'PROPERTY', price: 260, rent: 22, color: COLORS.YELLOW, groupId: 6, houseCost: 150 },
    { id: 27, name: 'Đ. Lê Thái Tổ', type: 'PROPERTY', price: 260, rent: 22, color: COLORS.YELLOW, groupId: 6, houseCost: 150 },
    { id: 28, name: 'Công Ty Nước', type: 'UTILITY', price: 150, rent: 20, color: COLORS.UTIL },
    { id: 29, name: 'Đ. Bà Triệu', type: 'PROPERTY', price: 280, rent: 24, color: COLORS.YELLOW, groupId: 6, houseCost: 150 },
    { id: 30, name: 'VÀO TÙ', type: 'GOTOJAIL', color: COLORS.SPECIAL },
    { id: 31, name: 'Đ. Đồng Khởi', type: 'PROPERTY', price: 300, rent: 26, color: COLORS.GREEN, groupId: 7, houseCost: 200 },
    { id: 32, name: 'Đ. Tôn Đức Thắng', type: 'PROPERTY', price: 300, rent: 26, color: COLORS.GREEN, groupId: 7, houseCost: 200 },
    { id: 33, name: 'Khí Vận', type: 'CHEST', color: COLORS.SPECIAL },
    { id: 34, name: 'Lăng Bác', type: 'PROPERTY', price: 320, rent: 28, color: COLORS.GREEN, groupId: 7, houseCost: 200 },
    { id: 35, name: 'Sân Bay Nội Bài', type: 'RAILROAD', price: 200, rent: 25, color: COLORS.RAIL },
    { id: 36, name: 'Cơ Hội', type: 'CHANCE', color: COLORS.SPECIAL },
    { id: 37, name: 'Bitexco', type: 'PROPERTY', price: 350, rent: 35, color: COLORS.DBLUE, groupId: 8, houseCost: 200 },
    { id: 38, name: 'Thuế Hàng Hiệu', type: 'TAX', price: 100, color: COLORS.TAX },
    { id: 39, name: 'Landmark 81', type: 'PROPERTY', price: 400, rent: 50, color: COLORS.DBLUE, groupId: 8, houseCost: 200 }
];

// ---------------------------------------------------------------------------
// Card decks (game.js handleCardDraw, same order). Card SELECTION is a caller
// concern (DRAW_CARD carries cardIndex); these arrays define text + effect.
// ---------------------------------------------------------------------------

/** Chance — "CƠ HỘI" (16 cards). */
export const CHANCE_CARDS: readonly CardDef[] = [
    // FIX-4: was "grant tile 35 if unowned + $500 in place"; now move + salary + normal landing.
    { text: 'Được bầu làm giám đốc sân bay Hà Nội. Lĩnh lương $500.', effect: { kind: 'move_to', target: 35, bonus: 500 } },
    { text: 'Đến ô Ga Sài Gòn ngay lập tức.', effect: { kind: 'move_to', target: 5 } },
    { text: 'Tự do đi tù (Chỉ ghé thăm).', effect: { kind: 'move_to', target: 10 } },
    { text: 'Đến ô Công Ty Điện. Nếu đang ở đúng ô được lĩnh $5000.', effect: { kind: 'move_to_or_collect', target: 12, collectIfThere: 5000 } },
    { text: 'Nhà lớn hơn nhà lầu. Lĩnh $500.', effect: { kind: 'collect', amount: 500 } },
    { text: 'Sau cơn mưa trời lại sáng. Tất cả người chơi lĩnh $250.', effect: { kind: 'collect_all', amount: 250 } },
    { text: 'Đội công nhân giao thông: Mất $50.', effect: { kind: 'pay', amount: 50 } },
    { text: 'Đến ô Thăm tù.', effect: { kind: 'move_to', target: 10 } },
    { text: 'Kẻ giậm mắc túi: Mất $15.', effect: { kind: 'pay', amount: 15 } },
    { text: 'Vào tù: Không được lĩnh lương và phải bỏ 2 lượt.', effect: { kind: 'goto_jail' } },
    { text: 'Đến ô Sân bay Hà Nội. Lĩnh lương $500.', effect: { kind: 'move_to', target: 35, bonus: 500 } },
    { text: 'Đến Công Ty Nước. Nếu đứng đúng ô được lĩnh $5000.', effect: { kind: 'move_to_or_collect', target: 28, collectIfThere: 5000 } },
    { text: 'Đi lùi 3 bước.', effect: { kind: 'move_steps', steps: -3 } },
    { text: 'Gặp lại các cá nhân gần nhất. Lĩnh $350.', effect: { kind: 'move_to_nearest_player', bonus: 350 } },
    { text: 'Đến ga Hà Nội.', effect: { kind: 'move_to', target: 25 } },
    { text: 'Đến ga Đà Nẵng. Nếu ở đúng ô được lĩnh $5000.', effect: { kind: 'move_to_or_collect', target: 15, collectIfThere: 5000 } }
];

/** Community chest — "KHÍ VẬN" (11 cards). */
export const CHEST_CARDS: readonly CardDef[] = [
    { text: 'Đến LandMark 81. Nếu đứng đúng ô đó lĩnh $500.', effect: { kind: 'move_to_or_collect', target: 39, collectIfThere: 500 } },
    { text: 'Đến Đ.Tôn Đức Thắng và lĩnh $250.', effect: { kind: 'move_to', target: 32, bonus: 250 } },
    { text: 'Mãn Hạn Tù: Thẻ ra tù vĩnh viễn.', effect: { kind: 'jail_free' } },
    { text: 'Tiến tới 3 bước.', effect: { kind: 'move_steps', steps: 3 } },
    { text: 'Gặp lại các cá nhân xa nhất.', effect: { kind: 'move_to_farthest_player' } },
    { text: 'Đến Cầu rồng lĩnh $250. Nếu đang ở Cầu rồng bị trừ $500.', effect: { kind: 'move_to_or_pay', target: 14, payIfThere: 500, moveBonus: 250 } },
    { text: 'Đến Thuế Thu Nhập lĩnh $250.', effect: { kind: 'move_to', target: 4, bonus: 250 } },
    { text: 'Vận khí nội công không đủ: Mất $100.', effect: { kind: 'pay', amount: 100 } },
    // Bonus 200 + the regular pass-GO salary 200 = the promised "x2 tiền thưởng".
    { text: 'Quay lại điểm bắt đầu. Nhận x2 tiền thưởng.', effect: { kind: 'move_to', target: 0, bonus: GAME_CONFIG.PASS_GO_MONEY } },
    { text: 'Đến Lăng Bác lĩnh $250 khi thiện nguyện tại đó.', effect: { kind: 'move_to', target: 34, bonus: 250 } },
    { text: 'Đến Đường Lê Thái Tổ lĩnh $250.', effect: { kind: 'move_to', target: 27, bonus: 250 } }
];
