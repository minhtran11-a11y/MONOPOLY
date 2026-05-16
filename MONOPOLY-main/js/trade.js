// --- TRADE NEGOTIATION UI (foundation) ---
// Players can propose trades: money + properties offered vs requested.
// Bot opponents accept based on a simple value-comparison heuristic.
(function () {
    const ROOT_ID = 'trade-modal';

    function build() {
        if (document.getElementById(ROOT_ID)) return;
        const el = document.createElement('div');
        el.id = ROOT_ID;
        el.className = 'trade-overlay hidden';
        el.innerHTML = `
            <div class="trade-modal" role="dialog" aria-modal="true" aria-labelledby="trade-title">
                <header class="trade-header">
                    <h2 id="trade-title">🤝 Đề nghị giao dịch</h2>
                    <button data-trade-close aria-label="Đóng" class="trade-close">✕</button>
                </header>
                <div class="trade-body">
                    <div class="trade-partner">
                        <span class="trade-label">Đối tác</span>
                        <select id="trade-partner" class="trade-input"></select>
                    </div>
                    <div class="trade-cols">
                        <div class="trade-col">
                            <h3>Bạn đề nghị</h3>
                            <label class="trade-money">
                                Tiền: $<input type="number" id="trade-offer-money" min="0" value="0">
                            </label>
                            <div class="trade-props" id="trade-offer-props"></div>
                        </div>
                        <div class="trade-col">
                            <h3>Bạn yêu cầu</h3>
                            <label class="trade-money">
                                Tiền: $<input type="number" id="trade-request-money" min="0" value="0">
                            </label>
                            <div class="trade-props" id="trade-request-props"></div>
                        </div>
                    </div>
                </div>
                <footer class="trade-footer">
                    <button class="trade-btn trade-btn-secondary" data-trade-close>Huỷ</button>
                    <button class="trade-btn trade-btn-primary" id="trade-submit">Gửi đề nghị →</button>
                </footer>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', (e) => { if (e.target === el) close(); });
        el.querySelectorAll('[data-trade-close]').forEach(b => b.addEventListener('click', close));
    }

    function populatePartners() {
        const sel = document.getElementById('trade-partner');
        if (!sel || !window.players) return;
        const me = window.Game ? window.Game.currentPlayerIndex : 0;
        sel.innerHTML = window.players
            .filter(p => p.id !== me && !p.bankrupt)
            .map(p => `<option value="${p.id}">${p.name} (${Utils.formatMoney(p.money)})</option>`).join('');
        sel.onchange = populateProps;
    }

    function propCheckbox(t, name) {
        return `<label class="trade-prop"><input type="checkbox" name="${name}" value="${t.id}"><span>${t.name}</span><em>${Utils.formatMoney(t.price || 0)}</em></label>`;
    }

    function populateProps() {
        const sel = document.getElementById('trade-partner');
        if (!sel || !sel.value) return;
        const partnerId = Number(sel.value);
        const me = window.Game ? window.Game.currentPlayerIndex : 0;
        const myProps = boardData.filter(t => t.owner === me && t.houses === 0 && !t.isMortgaged);
        const partnerProps = boardData.filter(t => t.owner === partnerId && t.houses === 0 && !t.isMortgaged);
        const off = document.getElementById('trade-offer-props');
        const req = document.getElementById('trade-request-props');
        off.innerHTML = myProps.length ? myProps.map(t => propCheckbox(t, 'offer')).join('') : '<p class="trade-empty">Không có đất khả dụng.</p>';
        req.innerHTML = partnerProps.length ? partnerProps.map(t => propCheckbox(t, 'request')).join('') : '<p class="trade-empty">Đối tác không có đất khả dụng.</p>';
    }

    function collect(formName) {
        const inputs = document.querySelectorAll(`input[name="${formName}"]:checked`);
        return Array.from(inputs).map(i => Number(i.value));
    }

    function evaluateTrade(offerVal, requestVal) {
        // Simple heuristic: AI accepts if request ≤ offer × 1.15
        return offerVal * 1.15 >= requestVal;
    }

    function valueProps(ids) {
        return ids.reduce((sum, id) => sum + (boardData[id].price || 0), 0);
    }

    function submit() {
        const partnerId = Number(document.getElementById('trade-partner').value);
        const me = window.Game ? window.Game.currentPlayerIndex : 0;
        const meP = window.players[me];
        const partner = window.players[partnerId];
        if (!partner) return;
        const offerMoney = Math.max(0, parseInt(document.getElementById('trade-offer-money').value || '0', 10));
        const requestMoney = Math.max(0, parseInt(document.getElementById('trade-request-money').value || '0', 10));
        const offerProps = collect('offer');
        const requestProps = collect('request');

        // Validation
        if (meP.money < offerMoney) { window.Toast && window.Toast.show('Bạn không đủ tiền để chào.', { type: 'error' }); return; }
        if (partner.money < requestMoney) { window.Toast && window.Toast.show('Đối tác không đủ tiền.', { type: 'error' }); return; }

        const offerVal = offerMoney + valueProps(offerProps);
        const requestVal = requestMoney + valueProps(requestProps);
        if (offerVal === 0 && requestVal === 0) { window.Toast && window.Toast.show('Đề nghị rỗng — không thay đổi gì.', { type: 'warn' }); return; }

        const accepted = partner.isBot ? evaluateTrade(offerVal, requestVal) : confirm(`${partner.name} có chấp nhận?`);
        if (!accepted) {
            if (typeof logMsg === 'function') logMsg(`❌ ${partner.name} đã từ chối giao dịch.`);
            if (window.Toast) window.Toast.show('Đề nghị bị từ chối', { type: 'warn' });
            close();
            return;
        }
        // Execute trade
        meP.money -= offerMoney; partner.money += offerMoney;
        partner.money -= requestMoney; meP.money += requestMoney;
        offerProps.forEach(id => { boardData[id].owner = partnerId; });
        requestProps.forEach(id => { boardData[id].owner = me; });

        if (typeof logMsg === 'function') logMsg(`🤝 ${meP.name} và ${partner.name} đã hoàn tất giao dịch.`);
        if (window.Toast) window.Toast.show('Giao dịch thành công!', { type: 'success', icon: '🤝' });
        if (typeof updatePlayerUI === 'function') updatePlayerUI();
        close();
    }

    function open() {
        if (!window.Game || !window.players) return;
        const me = window.Game.currentPlayerIndex;
        if (window.players[me] && window.players[me].isBot) {
            if (window.Toast) window.Toast.show('Bot không thể chủ động giao dịch', { type: 'warn' });
            return;
        }
        build();
        const el = document.getElementById(ROOT_ID);
        el.classList.remove('hidden');
        document.body.classList.add('modal-open');
        populatePartners();
        populateProps();
        const submitBtn = document.getElementById('trade-submit');
        if (submitBtn) submitBtn.onclick = submit;
        if (window.SoundFX) window.SoundFX.click();
    }

    function close() {
        const el = document.getElementById(ROOT_ID);
        if (el) el.classList.add('hidden');
        document.body.classList.remove('modal-open');
        if (window.SoundFX) window.SoundFX.click();
    }

    window.TradeUI = { open, close };
})();
