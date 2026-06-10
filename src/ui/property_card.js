// --- PROPERTY CARD POPUP (3D-feel via CSS transforms) ---
    const CARD_ID = 'property-card-modal';

    function ensureRoot() {
        let el = document.getElementById(CARD_ID);
        if (el) return el;
        el = document.createElement('div');
        el.id = CARD_ID;
        el.className = 'property-card-overlay hidden';
        el.innerHTML = `<div class="property-card" role="dialog" aria-modal="true" aria-labelledby="pc-title"></div>`;
        document.body.appendChild(el);
        el.addEventListener('click', (e) => { if (e.target === el) close(); });
        return el;
    }

    function close() {
        const el = document.getElementById(CARD_ID);
        if (!el) return;
        const card = el.querySelector('.property-card');
        if (card) card.classList.remove('property-card-in');
        setTimeout(() => {
            el.classList.add('hidden');
            document.body.classList.remove('modal-open');
        }, 220);
        if (window.SoundFX) window.SoundFX.click();
    }

    function colorHex(tile) {
        if (!tile.color) return '#94a3b8';
        return '#' + tile.color.toString(16).padStart(6, '0');
    }

    function ownerLabel(tile) {
        if (tile.owner === null || tile.owner === undefined) return 'Ngân hàng';
        const players = window.players || [];
        const p = players[tile.owner];
        return p ? p.name : 'Không rõ';
    }

    function rentTableHtml(tile) {
        if (tile.type !== TILE_TYPES.PROPERTY) return '';
        const base = tile.rent || 0;
        const rows = [
            { label: '0 nhà',           v: base },
            { label: '0 nhà + monopoly', v: base * 2 },
            { label: '1 nhà',           v: base * 5 },
            { label: '2 nhà',           v: base * 15 },
            { label: '3 nhà',           v: base * 45 },
            { label: '4 nhà',           v: base * 80 },
            { label: 'Khách sạn',       v: base * 125 }
        ];
        const fmt = (v) => '$' + (typeof Utils !== 'undefined' ? Utils.formatMoney(v).replace('$','') : v);
        const currentRow = (tile.houses === 5) ? 6 : (tile.houses > 0 ? tile.houses + 1 : (tile.owner !== null && window.calculateRent && tile.rent && rows[1].v === window.calculateRent(tile) ? 1 : 0));
        return `
            <h4 class="pc-section-title">💰 Bảng giá thuê</h4>
            <ul class="pc-rent-list">
                ${rows.map((r, i) => `<li class="${i === currentRow ? 'pc-rent-current' : ''}"><span>${r.label}</span><strong>${fmt(r.v)}</strong></li>`).join('')}
            </ul>
        `;
    }

    function railwayRentHtml(tile) {
        if (tile.type !== TILE_TYPES.RAILROAD) return '';
        return `
            <h4 class="pc-section-title">🚂 Tiền thuê theo số bến tàu</h4>
            <ul class="pc-rent-list">
                <li><span>1 bến</span><strong>$25</strong></li>
                <li><span>2 bến</span><strong>$50</strong></li>
                <li><span>3 bến</span><strong>$100</strong></li>
                <li><span>4 bến</span><strong>$200</strong></li>
            </ul>
        `;
    }

    function utilityRentHtml(tile) {
        if (tile.type !== TILE_TYPES.UTILITY) return '';
        return `
            <h4 class="pc-section-title">💡 Tiền thuê công ty</h4>
            <ul class="pc-rent-list">
                <li><span>Sở hữu 1</span><strong>4× xúc xắc</strong></li>
                <li><span>Sở hữu 2</span><strong>10× xúc xắc</strong></li>
            </ul>
        `;
    }

    function buildBody(tile) {
        const c = colorHex(tile);
        const isProp = tile.type === TILE_TYPES.PROPERTY;
        const isRR = tile.type === TILE_TYPES.RAILROAD;
        const isU = tile.type === TILE_TYPES.UTILITY;
        const showRent = isProp || isRR || isU;

        const statusBadge = tile.isMortgaged
            ? '<span class="pc-badge pc-badge-warn">ĐANG CẦM CỐ</span>'
            : (tile.owner !== null ? '<span class="pc-badge pc-badge-info">ĐÃ CÓ CHỦ</span>' : '<span class="pc-badge pc-badge-ok">CÓ THỂ MUA</span>');

        const houseInfo = (isProp && tile.houses > 0)
            ? `<div class="pc-houses">🏠 ${tile.houses === 5 ? 'Khách sạn' : tile.houses + ' nhà'}</div>`
            : '';

        return `
            <header class="pc-header" style="--pc-color: ${c}">
                <div class="pc-color-strip"></div>
                <button class="pc-close" aria-label="Đóng" data-pc-close>✕</button>
                <h2 id="pc-title" class="pc-title">${tile.name}</h2>
                <div class="pc-meta">
                    ${statusBadge}
                    ${houseInfo}
                </div>
            </header>
            <div class="pc-body">
                <div class="pc-row">
                    <span>Loại</span>
                    <strong>${typeLabel(tile.type)}</strong>
                </div>
                ${tile.price ? `<div class="pc-row"><span>Giá mua</span><strong>${Utils.formatMoney(tile.price)}</strong></div>` : ''}
                ${isProp && tile.houseCost ? `<div class="pc-row"><span>Giá xây 1 nhà</span><strong>${Utils.formatMoney(tile.houseCost)}</strong></div>` : ''}
                <div class="pc-row">
                    <span>Chủ sở hữu</span>
                    <strong>${ownerLabel(tile)}</strong>
                </div>
                ${tile.price ? `<div class="pc-row"><span>Cầm cố</span><strong>${Utils.formatMoney(Math.floor(tile.price * 0.5))}</strong></div>` : ''}
                ${showRent ? rentTableHtml(tile) : ''}
                ${showRent ? railwayRentHtml(tile) : ''}
                ${showRent ? utilityRentHtml(tile) : ''}
            </div>
            <footer class="pc-footer">
                <button class="pc-btn pc-btn-secondary" data-pc-close>Đóng</button>
            </footer>
        `;
    }

    function typeLabel(type) {
        switch (type) {
            case TILE_TYPES.PROPERTY:  return 'Bất động sản';
            case TILE_TYPES.RAILROAD:  return 'Bến tàu / sân bay';
            case TILE_TYPES.UTILITY:   return 'Công ty tiện ích';
            case TILE_TYPES.CHANCE:    return 'Cơ hội';
            case TILE_TYPES.CHEST:     return 'Khí vận';
            case TILE_TYPES.TAX:       return 'Thuế';
            case TILE_TYPES.JAIL:      return 'Thăm tù';
            case TILE_TYPES.GOTOJAIL:  return 'Vào tù';
            case TILE_TYPES.PARKING:   return 'Bãi đậu xe';
            case TILE_TYPES.START:     return 'Khởi đầu';
        }
        return 'Ô đặc biệt';
    }

    function open(tile) {
        if (!tile) return;
        const el = ensureRoot();
        const card = el.querySelector('.property-card');
        card.innerHTML = buildBody(tile);
        el.classList.remove('hidden');
        document.body.classList.add('modal-open');
        requestAnimationFrame(() => card.classList.add('property-card-in'));
        if (window.SoundFX) window.SoundFX.click();
        card.querySelectorAll('[data-pc-close]').forEach(b => b.addEventListener('click', close));
    }

    document.addEventListener('keydown', (e) => {
        const el = document.getElementById(CARD_ID);
        if (e.key === 'Escape' && el && !el.classList.contains('hidden')) close();
    });

    window.PropertyCard = { open, close }; // LEGACY-BRIDGE

export const PropertyCard = window.PropertyCard;
