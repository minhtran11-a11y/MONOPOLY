import { ctx3d } from '../3d/context.js';
import { computeDestination, passedGo } from '../core/rules_core.ts';

// --- GAME LOGIC ENGINE ---
const Game = {
    players: [],
    currentPlayerIndex: 0,
    isAnimating: false,
    lastRoll: null,  // { d1, d2, total } — for replay
    
    init(total, mode) {
        // Clear previous state
        this.players = [];
        this.currentPlayerIndex = 0;
        
        // Reset board data
        boardData.forEach(t => {
            if(t.type === TILE_TYPES.PROPERTY || t.type === TILE_TYPES.RAILROAD || t.type === TILE_TYPES.UTILITY) {
                t.owner = null; 
                t.houses = 0;
                if(t.houseMeshes) {
                    const mesh = ctx3d.boardMeshes[t.id];
                    if (mesh) t.houseMeshes.forEach(h => mesh.remove(h));
                    t.houseMeshes = [];
                }
                if(t.ownerMesh) {
                    const mesh = ctx3d.boardMeshes[t.id];
                    if (mesh) mesh.remove(t.ownerMesh);
                    t.ownerMesh = null;
                }
            }
        });

        // Create new players
        createPlayers(total, mode); // From engine.js
        this.players = window.players; // Reference global players from engine.js
        
        // Randomize starting player
        this.currentPlayerIndex = Math.floor(Math.random() * this.players.length);
        const startPlayer = this.players[this.currentPlayerIndex];
        
        renderPlayerUI();
        const _logEl = document.getElementById('game-log');
        if (_logEl) _logEl.innerHTML = '';
        logMsg(`Chào mừng bạn đến với Cờ Tỷ Phú! Mỗi người nhận được ${Utils.formatMoney(GAME_CONFIG.START_MONEY)}.`);
        logMsg(`🎲 Đã tung xúc xắc quyết định: ${startPlayer.name} được đi trước!`);
        
        this.startTurn();
    },

    startTurn() {
        // ONLINE-MODE: the server (game-action) is authoritative — refresh the
        // HUD only; no local turn loop, bot timers or local modals.
        if (window._gameMode === 'online') { updatePlayerUI(); return; }
        const p = this.players[this.currentPlayerIndex];
        if (p.bankrupt) { this.nextTurn(); return; }

        updatePlayerUI();

        // Camera auto-focus has been disabled so the player can manually rotate and control the view
        /*
        if (window.Cinematics) {
            if (p.isBot) {
                window.Cinematics.focusOnPlayer(p);
            } else {
                window.Cinematics.returnToOverview();
            }
        }
        */

        if (p.isBot) {
            hideModal();
            setTimeout(() => this.doBotTurn(p), 1500); // Increased from 1s to 1.5s
            return;
        }

        let buttons = ['roll'];
        if (getBuildableProperties(p.id).length > 0 && !p.inJail) buttons.push('build-menu');

        if (p.inJail) {
            // FIX-3: turn counting + fine live in the roll handler (shared with bots)
            showModal(`Lượt của ${p.name}`, `Đang trong tù (Lượt ${p.jailTurns + 1}/3). Đang tự động tung xúc xắc...`, ['roll']);
            
            // Auto-process jail turn for human to keep bot flow
            setTimeout(() => {
                if (this.currentPlayerIndex === p.id && p.inJail) {
                    const btn = document.getElementById('btn-roll');
                    if (btn) btn.click();
                }
            }, 2000);
        } else {
            showModal(`Lượt của ${p.name}`, `Nhấn giữ phím Space hoặc giữ nút để tung xúc xắc.`, buttons);
        }
    },

    doBotTurn(p) {
        if (window._gameMode === 'online') return; // ONLINE-MODE: no bot engine
        p.isThinking = true;
        // Camera focus already happened in startTurn — no double tween here.
        updatePlayerUI();
        logMsg(`🤖 ${p.name} đang phân tích bàn cờ...`);
        
        // Phase 1: Thinking delay (Analysis)
        setTimeout(() => {
            // Phase 2: Strategic Building
            let buildables = getBuildableProperties(p.id);
            let difficulty = window.botDifficulty || 'medium';
            let didBuild = false;

            if (difficulty !== 'easy') {
                let buffer = difficulty === 'hard' ? 50 : 250;
                while (buildables.length > 0 && p.money > buildables[0].houseCost + buffer) {
                    const target = buildables[0];
                    this.executeBuildInternal(p, target);
                    buildables = getBuildableProperties(p.id);
                    didBuild = true;
                }
            }

            // Phase 3: Move Decision — physics decides d1/d2 now, not Math.random.
            setTimeout(() => {
                p.isThinking = false;
                updatePlayerUI();

                if(window.SoundFX) window.SoundFX.roll();
                // Bot uses a fixed mid-power toss (no UI to charge); player
                // has the press-and-hold charge UI in _bindRollButton.
                tossDice((d1, d2) => {
                    const total = d1 + d2;
                    const isDouble = (d1 === d2);
                    Game.lastRoll = { d1, d2, total, player: p.name };
                    logMsg(`🎲 NPC ${p.name} tung được ${total} (${d1} & ${d2})`);
                    if (p.inJail) {
                        if (p.jailFreeCards > 0) {
                            p.jailFreeCards--;
                            p.inJail = false; p.jailTurns = 0;
                            logMsg(`🔓 ${p.name} đã sử dụng thẻ "Mãn Hạn Tù" để thoát!`);
                            this.movePlayerAnim(p, total, isDouble);
                        } else {
                            p.jailTurns++;
                            if (isDouble || p.jailTurns >= 3) {
                                if (!isDouble) {
                                    this.payMoney(p, 'bank', 50);
                                    if (p.bankrupt) { setTimeout(() => Game.checkEndTurnPhase(false), 800); return; }
                                }
                                p.inJail = false; p.jailTurns = 0;
                                logMsg(`🔓 NPC ${p.name} đã thoát tù (${isDouble ? 'tung được đôi' : 'hết hạn'})!`);
                                this.movePlayerAnim(p, total, isDouble);
                            } else {
                                logMsg(`🔒 NPC ${p.name} không tung được đôi. Tiếp tục ở lại tù.`);
                                setTimeout(() => Game.checkEndTurnPhase(false), 800);
                            }
                        }
                    } else {
                        this.movePlayerAnim(p, total, isDouble);
                    }
                }, 0.6);
            }, 400); // Quick think before roll

        }, 400); // Fast analysis delay
    },

    executeBuildInternal(p, target) {
        p.money -= target.houseCost;
        target.houses++;
        if(window.SoundFX) window.SoundFX.build();
        if(window.Settings) window.Settings.haptic(30);
        const msg = `🔨 ${p.name} xây ${target.houses === 5 ? 'Khách sạn' : 'Nhà'} tại ${target.name}.`;
        logMsg(msg);
        if(window.Toast) window.Toast.show(msg, { type: 'success', icon: '🔨' });
        updatePlayerUI();
        update3DHouses(target.id);
    },

    movePlayerAnim(player, steps, isDouble = false) {
        window.isAnimating = true; // LEGACY-BRIDGE
        let current = player.position;
        let target = computeDestination(current, steps); // FIX-1: correct wrap for negative/zero steps

        if (passedGo(current, steps)) { // FIX-1: GO salary only on forward wraps
            player.money += GAME_CONFIG.PASS_GO_MONEY;
            const goMsg = `💰 ${player.name} đi qua BẮT ĐẦU, nhận ${Utils.formatMoney(GAME_CONFIG.PASS_GO_MONEY)}.`;
            logMsg(goMsg);
            if(window.Toast) window.Toast.show(goMsg, { type: 'money', icon: '💰' });
            if(window.Settings) window.Settings.haptic(40);
            updatePlayerUI();
        }

        player.position = target;
        let path = [];
        if (steps > 0) { // FIX-1: directional path (backward moves walk backward)
            for (let i = 1; i <= steps; i++) path.push((current + i) % 40);
        } else {
            for (let i = 1; i <= -steps; i++) path.push(((current - i) % 40 + 40) % 40);
        }

        if (path.length === 0) { // FIX-1: zero-step move must not leave isAnimating stuck
            window.isAnimating = false; // LEGACY-BRIDGE
            this.handleSpaceLanded(player, target, isDouble);
            return;
        }

        path.forEach((tileIdx, i) => {
            setTimeout(() => {
                let tilePos = ctx3d.boardMeshes[tileIdx].position;
                player.mesh.position.x = tilePos.x + (player.id % 2 === 0 ? 1.5 : -1.5);
                player.mesh.position.z = tilePos.z + (player.id > 1 ? 1.5 : -1.5);

                // Squash-stretch hop animation
                if (window.animateTokenHop) {
                    window.animateTokenHop(player.mesh, 2.0, 1.0, 200);
                } else {
                    player.mesh.position.y = 2.0;
                    setTimeout(() => player.mesh.position.y = 1.0, 150);
                }

                // Trail sparkle in player color
                if (window.Anim3D && window.scene && player.colorHex) {
                    const c = parseInt(player.colorHex.replace('#', ''), 16);
                    window.Anim3D.trailEmit(window.scene, player.mesh.position.clone(), c);
                }

                if (i === path.length - 1) {
                    setTimeout(() => {
                        window.isAnimating = false; // LEGACY-BRIDGE
                        // Pulse the destination tile so player can see exactly where they landed
                        if (window.Anim3D && ctx3d.boardMeshes[tileIdx]) {
                            window.Anim3D.tilePulse(ctx3d.boardMeshes[tileIdx]);
                        }
                        this.handleSpaceLanded(player, tileIdx, isDouble);
                    }, 400);
                }
            }, i * 250);
        });
    },

    handleSpaceLanded(player, tileIdx, isDouble) {
        updatePlayerUI();
        const tile = boardData[tileIdx];
        logMsg(`📍 ${player.name} đã dừng tại: ${tile.name}`);

        if (tile.type === TILE_TYPES.PROPERTY || tile.type === TILE_TYPES.RAILROAD || tile.type === TILE_TYPES.UTILITY) {
            if (tile.owner === null) {
                this.handleUnownedProperty(player, tile, tileIdx, isDouble);
            } else if (tile.owner !== player.id) {
                this.handleRentPayment(player, tile, isDouble);
            } else {
                this.checkEndTurnPhase(isDouble);
            }
        } else {
            this.handleSpecialTile(player, tile, isDouble);
        }
    },

    handleUnownedProperty(player, tile, tileIdx, isDouble) {
        if (player.isBot) {
            let diff = window.botDifficulty || 'medium';
            let buffer = diff === 'hard' ? 0 : (diff === 'easy' ? 400 : 150);
            if (player.money >= tile.price + buffer) {
                this.executeBuyProperty(player, tile, tileIdx);
            }
            setTimeout(() => this.checkEndTurnPhase(isDouble), 1000);
        } else {
            if (player.money >= tile.price) {
                showModal(`Mua Đất?`, `${tile.name}\nGiá: ${Utils.formatMoney(tile.price)}\nTiền thuê: ${Utils.formatMoney(calculateRent(tile))}`, ['buy', 'skip']);
                const btnBuy = document.getElementById('btn-buy');
                const btnSkip = document.getElementById('btn-skip');
                if (btnBuy) btnBuy.onclick = () => {
                    // ONLINE-MODE: stale-closure guard — tileId resolved by the hook
                    if (window._gameMode === 'online') { window._onlineSend?.({ type: 'BUY' }); return; }
                    hideModal();
                    this.executeBuyProperty(player, tile, tileIdx);
                    this.checkEndTurnPhase(isDouble);
                };
                if (btnSkip) btnSkip.onclick = () => {
                    if (window._gameMode === 'online') { window._onlineSend?.({ type: 'SKIP_BUY' }); return; } // ONLINE-MODE
                    hideModal();
                    logMsg(`${player.name} đã từ chối mua.`);
                    this.checkEndTurnPhase(isDouble);
                };
            } else {
                logMsg(`Bạn không đủ tiền để mua ${tile.name}.`);
                this.checkEndTurnPhase(isDouble);
            }
        }
    },

    handleRentPayment(player, tile, isDouble) {
        const owner = this.players[tile.owner];
        if (owner.bankrupt || owner.inJail || tile.isMortgaged) {
            let reason = tile.isMortgaged ? 'đang cầm cố' : (owner.inJail ? 'trong tù' : 'phá sản');
            logMsg(`🏠 Chủ sở hữu ${owner.name} đang ${reason}. Miễn tiền thuê!`);
        } else {
            let rent = calculateRent(tile);
            if(window.SoundFX) window.SoundFX.pay();
            if(window.Settings) window.Settings.haptic(60);
            if (player.isBot) this.botChat(player, 'pay');
            const rentMsg = `💸 ${player.name} đã trả ${Utils.formatMoney(rent)} tiền thuê cho ${owner.name}.`;
            logMsg(rentMsg);
            if(window.Toast) window.Toast.show(rentMsg, { type: 'warn', icon: '💸' });
            // Money particles for big rent
            if (rent >= 200 && window.Anim3D && window.scene && player.mesh && owner.mesh) {
                window.Anim3D.moneyFly(window.scene, player.mesh.position.clone(), owner.mesh.position.clone(), Math.min(20, Math.floor(rent / 100)));
            }
            this.payMoney(player, owner.id, rent);
        }
        
        if (player.isBot) setTimeout(() => Game.checkEndTurnPhase(isDouble), 800);
        else Game.checkEndTurnPhase(isDouble);
    },

    handleSpecialTile(player, tile, isDouble) {
        if (tile.type === TILE_TYPES.TAX) {
            if(window.SoundFX) window.SoundFX.pay();
            logMsg(`💸 ${player.name} đã nộp ${Utils.formatMoney(tile.price)} tiền thuế.`);
            this.payMoney(player, 'bank', tile.price);
        } else if (tile.type === TILE_TYPES.GOTOJAIL) {
            logMsg(`🚓 ${player.name} bị BẮT GIAM!`);
            if (player.isBot) this.botChat(player, 'jail');
            player.inJail = true;
            player.position = 10;
            player.mesh.position.copy(ctx3d.boardMeshes[10].position);
            player.mesh.position.y = 2.5;
            isDouble = false; 
        } else if (tile.type === TILE_TYPES.CHANCE || tile.type === TILE_TYPES.CHEST) {
            this.handleCardDraw(player, tile.type === TILE_TYPES.CHANCE, isDouble);
            return; 
        }
        
        if (player.isBot) setTimeout(() => this.checkEndTurnPhase(isDouble), 1000);
        else this.checkEndTurnPhase(isDouble);
    },

    movePlayerToJail(player) {
        if(window.SoundFX) window.SoundFX.jail();
        if(window.Settings) window.Settings.haptic([80, 40, 80]);
        const jMsg = `🚓 ${player.name} bị BẮT GIAM!`;
        logMsg(jMsg);
        if(window.Toast) window.Toast.show(jMsg, { type: 'warn', icon: '🚓' });
        if (player.isBot) this.botChat(player, 'jail');
        player.inJail = true;
        player.position = 10;
        player.mesh.position.copy(ctx3d.boardMeshes[10].position);
        player.mesh.position.y = 2.5;
        this.checkEndTurnPhase(false);
    },

    handleCardDraw(player, isChance, isDouble) {
        const moveToTile = (p, targetIdx, bonus = 0) => {
            const current = p.position;
            const steps = (targetIdx - current + 40) % 40;
            if (bonus > 0) p.money += bonus;
            Game.movePlayerAnim(p, steps, isDouble);
        };

        const cards = isChance ? [
            { msg: "Được bầu làm giám đốc sân bay Hà Nội. Lĩnh lương $500.", effect: (p) => moveToTile(p, 35, 500) }, // FIX-4: no silent ownership grant
            { msg: "Đến ô Ga Sài Gòn ngay lập tức.", effect: (p) => moveToTile(p, 5) },
            { msg: "Tự do đi tù (Chỉ ghé thăm).", effect: (p) => moveToTile(p, 10) },
            { msg: "Đến ô Công Ty Điện. Nếu đang ở đúng ô được lĩnh $5000.", effect: (p) => {
                if (p.position === 12) { p.money += 5000; Game.checkEndTurnPhase(isDouble); }
                else moveToTile(p, 12);
            }},
            { msg: "Nhà lớn hơn nhà lầu. Lĩnh $500.", effect: (p) => { p.money += 500; Game.checkEndTurnPhase(isDouble); } },
            { msg: "Sau cơn mưa trời lại sáng. Tất cả người chơi lĩnh $250.", effect: (p) => { 
                Game.players.forEach(pl => { if(!pl.bankrupt) pl.money += 250; });
                Game.checkEndTurnPhase(isDouble);
            }},
            { msg: "Đội công nhân giao thông: Mất $50.", effect: (p) => { Game.payMoney(p, 'bank', 50); Game.checkEndTurnPhase(isDouble); } },
            { msg: "Đến ô Thăm tù.", effect: (p) => moveToTile(p, 10) },
            { msg: "Kẻ giậm mắc túi: Mất $15.", effect: (p) => { Game.payMoney(p, 'bank', 15); Game.checkEndTurnPhase(isDouble); } },
            { msg: "Vào tù: Không được lĩnh lương và phải bỏ 2 lượt.", effect: (p) => Game.movePlayerToJail(p) },
            { msg: "Đến ô Sân bay Hà Nội. Lĩnh lương $500.", effect: (p) => moveToTile(p, 35, 500) },
            { msg: "Đến Công Ty Nước. Nếu đứng đúng ô được lĩnh $5000.", effect: (p) => {
                if (p.position === 28) { p.money += 5000; Game.checkEndTurnPhase(isDouble); }
                else moveToTile(p, 28);
            }},
            { msg: "Đi lùi 3 bước.", effect: (p) => Game.movePlayerAnim(p, -3, isDouble) },
            { msg: "Gặp lại các cá nhân gần nhất. Lĩnh $350.", effect: (p) => {
                let nearestDist = 41; let targetIdx = p.position;
                Game.players.forEach(pl => {
                    if (pl.id !== p.id && !pl.bankrupt) {
                        let d = (pl.position - p.position + 40) % 40;
                        if (d < nearestDist) { nearestDist = d; targetIdx = pl.position; }
                    }
                });
                moveToTile(p, targetIdx, 350);
            }},
            { msg: "Đến ga Hà Nội.", effect: (p) => moveToTile(p, 25) },
            { msg: "Đến ga Đà Nẵng. Nếu ở đúng ô được lĩnh $5000.", effect: (p) => {
                if (p.position === 15) { p.money += 5000; Game.checkEndTurnPhase(isDouble); }
                else moveToTile(p, 15);
            }}
        ] : [
            { msg: "Đến LandMark 81. Nếu đứng đúng ô đó lĩnh $500.", effect: (p) => {
                if (p.position === 39) { p.money += 500; Game.checkEndTurnPhase(isDouble); }
                else moveToTile(p, 39);
            }},
            { msg: "Đến Đ.Tôn Đức Thắng và lĩnh $250.", effect: (p) => moveToTile(p, 32, 250) },
            { msg: "Mãn Hạn Tù: Thẻ ra tù vĩnh viễn.", effect: (p) => { p.jailFreeCards++; Game.checkEndTurnPhase(isDouble); } },
            { msg: "Tiến tới 3 bước.", effect: (p) => Game.movePlayerAnim(p, 3, isDouble) },
            { msg: "Gặp lại các cá nhân xa nhất.", effect: (p) => {
                let maxDist = -1; let targetIdx = p.position;
                Game.players.forEach(pl => {
                    if (pl.id !== p.id && !pl.bankrupt) {
                        let d = (pl.position - p.position + 40) % 40;
                        if (d > maxDist) { maxDist = d; targetIdx = pl.position; }
                    }
                });
                moveToTile(p, targetIdx);
            }},
            { msg: "Đến Cầu rồng lĩnh $250. Nếu đang ở Cầu rồng bị trừ $500.", effect: (p) => {
                if (p.position === 14) { Game.payMoney(p, 'bank', 500); Game.checkEndTurnPhase(isDouble); }
                else moveToTile(p, 14, 250);
            }},
            { msg: "Đến Thuế Thu Nhập lĩnh $250.", effect: (p) => moveToTile(p, 4, 250) },
            { msg: "Vận khí nội công không đủ: Mất $100.", effect: (p) => { Game.payMoney(p, 'bank', 100); Game.checkEndTurnPhase(isDouble); } },
            { msg: "Quay lại điểm bắt đầu. Nhận x2 tiền thưởng.", effect: (p) => moveToTile(p, 0, GAME_CONFIG.PASS_GO_MONEY) },
            { msg: "Đến Lăng Bác lĩnh $250 khi thiện nguyện tại đó.", effect: (p) => moveToTile(p, 34, 250) },
            { msg: "Đến Đường Lê Thái Tổ lĩnh $250.", effect: (p) => moveToTile(p, 27, 250) }
        ];

        const card = cards[Math.floor(Math.random() * cards.length)];
        showCardAnimation(isChance ? 'CƠ HỘI' : 'KHÍ VẬN', card.msg, isChance ? '#ef4444' : '#eab308', isChance ? -12 : 12, () => {
            logMsg(`${isChance ? '🧧' : '🎐'} ${card.msg}`);
            card.effect(player);
            updatePlayerUI();
        });
    },

    executeBuyProperty(player, tile, tileIdx) {
        if(window.SoundFX) window.SoundFX.buy();
        if(window.Settings) window.Settings.haptic([20, 30, 40]);
        player.money -= tile.price;
        tile.owner = player.id;
        const buyMsg = `🏡 ${player.name} đã mua ${tile.name}.`;
        logMsg(buyMsg);
        if(window.Toast) window.Toast.show(buyMsg, { type: 'success', icon: '🏡' });
        
        const groupCount = boardData.filter(t => t.groupId === tile.groupId && t.owner === player.id).length;
        if (tile.type === TILE_TYPES.RAILROAD) logMsg(`🚂 Bạn hiện sở hữu ${groupCount}/4 bến tàu.`);
        if (tile.type === TILE_TYPES.UTILITY) logMsg(`💡 Bạn hiện sở hữu ${groupCount}/2 công ty.`);

        // Add refined owner indicator (Horizontal Neon Strip at the outer edge)
        const w = 5.4; 
        const d = 0.5;
        
        const barGeo = new THREE.BoxGeometry(w, 0.25, d);
        const barMat = new THREE.MeshStandardMaterial({ 
            color: PLAYER_COLORS[player.id],
            roughness: 0.5,
            metalness: 0.2
        });
        const ownerIndicator = new THREE.Mesh(barGeo, barMat);
        
        // Local posZ = 4.7 is the outer edge for all tiles due to engine.js rotation logic
        ownerIndicator.position.set(0, 0.58, 4.7); 
        ctx3d.boardMeshes[tileIdx].add(ownerIndicator);
        tile.ownerMesh = ownerIndicator;
        updatePlayerUI();
    },

    payMoney(fromPlayer, toId, amount) {
        if (fromPlayer.money < amount) {
            this.handleLiquidation(fromPlayer, amount);
        }
        
        // FIX-2: transfer only what the payer can raise; shortfall triggers bankruptcy.
        const paid = Math.min(Math.max(fromPlayer.money, 0), amount);
        fromPlayer.money -= paid;
        if (toId !== 'bank') this.players[toId].money += paid;
        updatePlayerUI();

        if (paid < amount) {
            this.handleBankruptcy(fromPlayer);
        }
    },

    handleLiquidation(p, targetAmount) {
        if (p.isBot) logMsg(`💡 ${p.name} đang tìm cách huy động vốn...`);
        
        // 1. Sell houses first
        const ownedProperties = boardData.filter(t => t.owner === p.id && t.houses > 0);
        for (let t of ownedProperties) {
            while (t.houses > 0 && p.money < targetAmount) {
                const refund = Math.floor(t.houseCost / 2);
                p.money += refund;
                t.houses--;
                update3DHouses(t.id);
                logMsg(`💸 ${p.name} bán 1 căn nhà tại ${t.name} để lấy ${Utils.formatMoney(refund)}.`);
                if (p.money >= targetAmount) break;
            }
            if (p.money >= targetAmount) break;
        }

        // 2. Future expansion: Mortgage properties (if money still low)
    },

    botChat(p, type) {
        const dialogs = {
            buy: ["Chỗ này phong thủy tốt, tôi mua!", "Đất vàng đây rồi!", "Thêm một bất động sản vào bộ sưu tập."],
            pay: ["Đắt xắt ra miếng...", "Thuê chỗ này hơi chát nhé!", "Lần sau tôi sẽ không dừng lại đây nữa đâu."],
            jail: ["Oan ức quá, tôi bị gài bẫy!", "Trong này mát mẻ phết.", "Tôi sẽ sớm trở lại thôi!"],
            win: ["Tiền nhiều để làm gì?", "Tôi đã bảo tôi là tỷ phú mà!", "Hẹn gặp lại các bạn ở ván sau."]
        };
        const choices = dialogs[type];
        if (choices) {
            const msg = choices[Math.floor(Math.random() * choices.length)];
            logMsg(`<span class="text-indigo-500 font-black">[${p.name}]:</span> <span class="italic text-slate-600">"${msg}"</span>`);
        }
    },

    handleBankruptcy(p) {
        if(window.SoundFX) window.SoundFX.bankrupt();
        if(window.Settings) window.Settings.haptic([100, 50, 100, 50, 200]);
        const bMsg = `💀 ${p.name} đã PHÁ SẢN!`;
        logMsg(bMsg);
        if(window.Toast) window.Toast.show(bMsg, { type: 'error', icon: '💀', ttl: 5000 });
        p.bankrupt = true;
        ctx3d.scene.remove(p.mesh);
        
        boardData.forEach(t => {
            if (t.owner === p.id) {
                t.owner = null;
                if (t.ownerMesh) { ctx3d.boardMeshes[t.id].remove(t.ownerMesh); t.ownerMesh = null; }
                if (t.houseMeshes) { t.houseMeshes.forEach(h => ctx3d.boardMeshes[t.id].remove(h)); t.houseMeshes = []; t.houses = 0; }
            }
        });

        const activePlayers = this.players.filter(pl => !pl.bankrupt);
        if (activePlayers.length === 1) {
            this.handleVictory(activePlayers[0]);
        }
    },

    handleVictory(winner) {
        if(window.SoundFX) window.SoundFX.win();
        if(window.Settings) window.Settings.haptic([200, 100, 200, 100, 400]);
        if(window.confetti) window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        if(window.Toast) window.Toast.show(`🏆 ${winner.name} chiến thắng!`, { type: 'success', icon: '🏆', ttl: 6000 });
        // Cinematic zoom-out + 3D confetti
        if(window.Cinematics) window.Cinematics.playWinning(winner);
        showModal("🏆 CHIẾN THẮNG!", `${winner.name} ĐÃ TRỞ THÀNH TỶ PHÚ!`, []);
    },

    checkEndTurnPhase(isDouble) {
        if (window._gameMode === 'online') return; // ONLINE-MODE: server drives turn flow
        if (Game.isProcessingTurn) return;
        if (Game.players.filter(p => !p.bankrupt).length <= 1) return;
        
        const p = Game.players[Game.currentPlayerIndex];
        if (!p || p.bankrupt) { Game.nextTurn(); return; }

        if (isDouble && !p.inJail) {
            logMsg(`🎲 Đôi! ${p.name} được thêm một lượt.`);
            if (p.isBot) setTimeout(() => Game.doBotTurn(p), 400);
            else showModal(`${p.name}`, `BẠN ĐỔ ĐƯỢC ĐÔI! Mời đổ tiếp.`, ['roll']);
            return;
        }

        if (p.isBot) {
            // Bot ends with a deliberate pause for the human to see
            Game.isProcessingTurn = true;
            setTimeout(() => Game.nextTurn(), 1500); 
        } else {
            const canBuild = getBuildableProperties(p.id).length > 0 && !p.inJail;
            
            if (canBuild) {
                // When player can build/mortgage: show menu, NO auto-timer, wait for manual End Turn
                showModal(`${p.name}`, `Bạn có thể xây nhà, cầm cố hoặc kết thúc lượt.`, ['build-menu', 'end']);
                Game.isProcessingTurn = true;
                // No auto-end timer — player must click End Turn manually
            } else {
                // No actions left: auto-end after short pause
                showModal(`${p.name}`, `Lượt đã hoàn tất. Đang chuyển lượt...`, ['end']);
                Game.isProcessingTurn = true;
                const autoEnd = setTimeout(() => {
                    if (Game.currentPlayerIndex === p.id) {
                        hideModal();
                        Game.nextTurn();
                    }
                }, 2000);
                const btnEndA = document.getElementById('btn-end');
                if (btnEndA) btnEndA.onclick = () => {
                    if (window._gameMode === 'online') { window._onlineSend?.({ type: 'END_TURN' }); return; } // ONLINE-MODE
                    clearTimeout(autoEnd);
                    hideModal();
                    Game.nextTurn();
                };
            }

            // End Turn button always works
            const btnEndB = document.getElementById('btn-end');
            if (btnEndB) btnEndB.onclick = () => {
                if (window._gameMode === 'online') { window._onlineSend?.({ type: 'END_TURN' }); return; } // ONLINE-MODE
                hideModal();
                Game.nextTurn();
            };
        }
    },

    nextTurn() {
        if (window._gameMode === 'online') return; // ONLINE-MODE: server advances turns
        // Centralized turn switching
        Game.isProcessingTurn = false;
        
        let originalIndex = Game.currentPlayerIndex;
        let count = 0;
        do {
            Game.currentPlayerIndex = (Game.currentPlayerIndex + 1) % Game.players.length;
            count++;
            if (count > 10) break; 
        } while (Game.players[Game.currentPlayerIndex].bankrupt && Game.currentPlayerIndex !== originalIndex);
        
        // Final victory check
        const active = Game.players.filter(pl => !pl.bankrupt);
        if (active.length === 1) {
            Game.handleVictory(active[0]);
        } else {
            Game.startTurn();
        }
    }
};

// --- GLOBAL INITIALIZER ---
window.Game = Game; // LEGACY-BRIDGE
window.initGameSession = (total, mode) => Game.init(total, mode); // LEGACY-BRIDGE

// --- ROLL BUTTON BINDING (press-and-hold to charge force) ---
//
// Each turn the player can HOLD the dice button to charge a power level
// (0..1, ramps to full over ~1.2s of hold) and RELEASE to fire the toss
// with that power. Power scales dice height/spread/spin inside
// rollDiceAnimation(). Bot + online paths still fire instantly with a
// default power so nothing gameplay-side breaks.
function _bindRollButton() {
    const btnRoll = document.getElementById('btn-roll');
    if (!btnRoll) return;

    const CHARGE_MS = 1200;
    const MIN_POWER = 0.18;
    const MAX_POWER = 1.0;
    let pressStart = null;
    let chargeRaf = null;
    let activePointerId = null;

    const meter = _ensurePowerMeter();
    const hint = _ensureRollHint(btnRoll);

    // 0 (untouched) → MIN_POWER (instant tap) → MAX_POWER (full charge)
    const currentPower = () => {
        if (pressStart == null) return 0;
        const t = Math.min(1, (performance.now() - pressStart) / CHARGE_MS);
        return MIN_POWER + t * (MAX_POWER - MIN_POWER);
    };

    const drawMeter = () => {
        const p = currentPower();
        const pct = Math.round(p * 100);
        meter.fill.style.width = pct + '%';
        meter.text.textContent = `${pct}%`;
        const color = p < 0.4 ? '#22c55e' : p < 0.75 ? '#f59e0b' : '#ef4444';
        meter.fill.style.background = color;
        // Subtle button glow to mirror the power level
        btnRoll.style.boxShadow = `0 0 0 ${Math.round(p * 8)}px ${color}55`;
        if (pressStart != null) chargeRaf = requestAnimationFrame(drawMeter);
    };

    const fireRoll = (power) => {
        // ONLINE-MODE: route to the authoritative referee (hook installed by
        // the MenuScreens online boot; dice are rolled server-side).
        if (window._gameMode === 'online') { window._onlineSend?.({ type: 'ROLL' }); return; }
        if (window.isAnimating) return;
        hideModal();
        const p = Game.players[Game.currentPlayerIndex];
        if (!p) return;

        if (window.SoundFX) window.SoundFX.roll();
        // Physics decides d1/d2 — whichever face ends up on top of each die.
        tossDice((d1, d2) => {
            const total = d1 + d2;
            const isDouble = (d1 === d2);
            Game.lastRoll = { d1, d2, total, player: p.name };
            logMsg(`🎲 ${p.name} tung được ${total} (${d1} & ${d2})`);
            if (p.inJail) {
                if (p.jailFreeCards > 0) {
                    p.jailFreeCards--;
                    p.inJail = false; p.jailTurns = 0;
                    logMsg(`🔓 ${p.name} đã sử dụng thẻ "Mãn Hạn Tù" để thoát!`);
                    Game.movePlayerAnim(p, total, false);
                } else if (isDouble) {
                    logMsg(`🔓 ${p.name} tung được đôi ${d1}-${d2} và đã thoát tù!`);
                    p.inJail = false; p.jailTurns = 0;
                    Game.movePlayerAnim(p, total, false);
                } else {
                    p.jailTurns++;
                    if (p.jailTurns >= 3) {
                        Game.payMoney(p, 'bank', 50);
                        if (p.bankrupt) { Game.checkEndTurnPhase(false); return; }
                        p.inJail = false; p.jailTurns = 0;
                        logMsg(`🔓 ${p.name} đã nộp phạt $50 và thoát tù!`);
                        Game.movePlayerAnim(p, total, false);
                    } else {
                        logMsg(`🔒 ${p.name} không tung được đôi. Tiếp tục ở lại tù (Lượt ${p.jailTurns}/3).`);
                        Game.checkEndTurnPhase(false);
                    }
                }
            } else {
                Game.movePlayerAnim(p, total, isDouble);
            }
        }, power);
    };

    const updateHint = () => {
        const hidden = btnRoll.classList.contains('hidden');
        const charging = pressStart != null;
        const animating = window.isAnimating === true;
        // Hint visible only when button is shown AND not charging AND idle.
        hint.root.classList.toggle('is-visible', !hidden && !charging && !animating);
    };

    const beginCharge = (pointerId) => {
        if (window.isAnimating) return;
        if (pressStart != null) return; // already charging
        activePointerId = pointerId ?? null;
        pressStart = performance.now();
        meter.root.classList.add('is-active');
        updateHint();
        chargeRaf = requestAnimationFrame(drawMeter);
    };

    const endCharge = (cancel = false) => {
        if (pressStart == null) return;
        const power = currentPower();
        pressStart = null;
        activePointerId = null;
        if (chargeRaf) cancelAnimationFrame(chargeRaf);
        chargeRaf = null;
        meter.root.classList.remove('is-active');
        btnRoll.style.boxShadow = '';
        meter.fill.style.width = '0%';
        updateHint();
        if (!cancel) fireRoll(power);
    };

    // Re-evaluate hint whenever ui.js toggles .hidden on the button
    // (showModal/hideModal toggle .hidden to show/hide the roll button).
    new MutationObserver(updateHint).observe(btnRoll, {
        attributes: true,
        attributeFilter: ['class'],
    });
    updateHint();
    // Cheap polling fallback for window.isAnimating changes (no setter trap)
    setInterval(updateHint, 400);

    btnRoll.addEventListener('pointerdown', (e) => {
        if (window.isAnimating) return;
        try { btnRoll.setPointerCapture(e.pointerId); } catch (err) { /* unsupported */ }
        beginCharge(e.pointerId);
    });
    btnRoll.addEventListener('pointerup', (e) => {
        if (activePointerId != null && e.pointerId !== activePointerId) return;
        endCharge(false);
    });
    btnRoll.addEventListener('pointercancel', () => endCharge(true));

    // Keyboard: Space = press-and-hold equivalent.
    let spaceDown = false;
    document.addEventListener('keydown', (e) => {
        if (e.code !== 'Space') return;
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (btnRoll.classList.contains('hidden')) return;
        e.preventDefault();
        if (spaceDown) return;
        spaceDown = true;
        beginCharge(null);
    });
    document.addEventListener('keyup', (e) => {
        if (e.code !== 'Space') return;
        if (!spaceDown) return;
        spaceDown = false;
        endCharge(false);
    });

    // Expose for the replay / online / test paths to fire a roll directly.
    window._fireRoll = (power) => fireRoll(power ?? 0.6);

    // Expose charge controls so React surfaces (ActionModal) can proxy the
    // press-and-hold gesture from their own rendered roll button. Without
    // this the React button could only forward a synthetic click() into
    // legacy #btn-roll, which our charge logic ignores (we only listen to
    // pointerdown/pointerup, not click).
    window._rollChargeBegin = (pointerId) => beginCharge(pointerId ?? null);
    window._rollChargeEnd = () => endCharge(false);
    window._rollChargeCancel = () => endCharge(true);
}

// Inject the power meter once, positioned just above the dice button. Stays
// hidden until .is-active is added.
function _ensurePowerMeter() {
    let root = document.getElementById('dice-power-meter');
    if (root) {
        return {
            root,
            fill: root.querySelector('.dice-power-fill'),
            text: root.querySelector('.dice-power-text'),
        };
    }
    root = document.createElement('div');
    root.id = 'dice-power-meter';
    root.className = 'dice-power-meter';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
        <div class="dice-power-label">Lực</div>
        <div class="dice-power-track">
            <div class="dice-power-fill"></div>
        </div>
        <div class="dice-power-text">0%</div>
    `;
    // Append to body — fixed positioning handles placement
    document.body.appendChild(root);
    return {
        root,
        fill: root.querySelector('.dice-power-fill'),
        text: root.querySelector('.dice-power-text'),
    };
}

// Inject "Nhấn giữ Space hoặc nút để tăng lực" hint as a chip under the
// roll button row. Visible only when .is-visible is added by updateHint().
function _ensureRollHint(btnRoll) {
    let root = document.getElementById('dice-roll-hint');
    if (!root) {
        root = document.createElement('div');
        root.id = 'dice-roll-hint';
        root.className = 'dice-roll-hint';
        root.setAttribute('aria-hidden', 'true');
        // Anchor to the action-modal so the chip sits underneath the button row.
        const parent = document.getElementById('action-modal')
            || btnRoll.parentElement?.parentElement
            || btnRoll.parentElement
            || document.body;
        root.innerHTML = `
            <span class="dice-roll-hint-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2v10"/>
                    <circle cx="12" cy="16" r="4"/>
                </svg>
            </span>
            <span class="dice-roll-hint-text">
                Nhấn giữ Space hoặc nút — thả ra để tung
            </span>
        `;
        parent.appendChild(root);
    }
    return { root };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bindRollButton);
} else {
    _bindRollButton();
}

window.replayLastRoll = () => { // LEGACY-BRIDGE
    if (!Game.lastRoll) {
        if (window.Toast) window.Toast.show('Chưa có lần tung xúc xắc nào', { type: 'warn' });
        return;
    }
    if (window.isAnimating) return;
    const r = Game.lastRoll;
    if (window.SoundFX) window.SoundFX.roll();
    if (typeof rollDiceAnimation === 'function') {
        rollDiceAnimation(r.d1, r.d2, () => {
            if (window.Toast) window.Toast.show(`🎲 Lần trước: ${r.d1} + ${r.d2} = ${r.total} (${r.player || ''})`, { type: 'info', icon: '🎲' });
        });
    }
};

window.exportGameLog = () => { // LEGACY-BRIDGE
    const logEl = document.getElementById('game-log');
    if (!logEl) return;
    const lines = Array.from(logEl.querySelectorAll('span.text-slate-700')).map(s => s.textContent);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url; a.download = `monopoly-log-${ts}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (window.Toast) window.Toast.show('Đã xuất nhật ký trận đấu', { type: 'success' });
};

window.toggleMortgage = (tileId) => { // LEGACY-BRIDGE
    const tile = boardData[tileId];
    const p = Game.players[Game.currentPlayerIndex];
    if (!tile || !p) return;
    if (tile.owner !== p.id) return;
    if (tile.houses > 0) {
        if (window.Toast) window.Toast.show('Phải bán nhà trước khi cầm cố', { type: 'warn' });
        return;
    }
    if (tile.isMortgaged) {
        const cost = Math.floor(tile.price * 0.6);
        if (p.money < cost) {
            if (window.Toast) window.Toast.show('Không đủ tiền chuộc đất', { type: 'error' });
            return;
        }
        p.money -= cost;
        tile.isMortgaged = false;
        logMsg(`🔓 ${p.name} chuộc lại ${tile.name} với ${Utils.formatMoney(cost)}.`);
        if (window.Toast) window.Toast.show(`Chuộc ${tile.name}`, { type: 'success' });
    } else {
        const refund = Math.floor(tile.price * 0.5);
        p.money += refund;
        tile.isMortgaged = true;
        logMsg(`🏦 ${p.name} cầm cố ${tile.name} lấy ${Utils.formatMoney(refund)}.`);
        if (window.Toast) window.Toast.show(`Cầm cố ${tile.name}`, { type: 'warn' });
    }
    if (window.applyMortgageVisual) window.applyMortgageVisual(tileId);
    if (window.SoundFX) window.SoundFX.click();
    updatePlayerUI();
};

window.executeBuild = (tileId) => { // LEGACY-BRIDGE
    const p = Game.players[Game.currentPlayerIndex];
    const tile = boardData[tileId];
    if (p.money >= tile.houseCost && tile.houses < 5) {
        p.money -= tile.houseCost;
        tile.houses++;
        if(window.SoundFX) window.SoundFX.build();
        logMsg(`🔨 ${p.name} đã xây ${tile.houses === 5 ? 'Khách sạn' : 'Nhà'} tại ${tile.name}.`);
        updatePlayerUI();
        update3DHouses(tileId);
        renderBuildMenu();
    }
};

window._bindRollButton = _bindRollButton; // LEGACY-BRIDGE

export { Game };
