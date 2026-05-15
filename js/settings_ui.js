// --- SETTINGS PANEL (modal UI + wiring) ---
(function () {
    const PANEL_ID = 'settings-modal';

    function buildPanel() {
        if (document.getElementById(PANEL_ID)) return;
        const cfg = Settings.get();
        const audio = window.SoundFX ? window.SoundFX.getConfig() : { master: 0.8, sfx: 0.9, bgm: 0.35, muted: false };

        const html = `
        <div id="${PANEL_ID}" class="hidden fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div class="glass-panel p-8 max-w-xl w-[92%] max-h-[88vh] overflow-y-auto custom-scrollbar border-white/20 relative">
                <div class="flex items-start justify-between mb-6">
                    <h2 id="settings-title" class="text-3xl font-black text-slate-900 uppercase italic leading-tight">⚙️ Cài đặt</h2>
                    <button data-close-settings type="button"
                        class="px-5 py-2 rounded-xl bg-slate-900/10 hover:bg-rose-500 hover:text-white text-slate-700 font-black text-xs uppercase tracking-widest transition-all border border-white/20"
                        aria-label="Đóng cài đặt">Thoát ✕</button>
                </div>

                <section class="space-y-5 text-slate-700 font-bold">
                    <div>
                        <h3 class="text-indigo-600 text-sm font-black mb-3 uppercase tracking-widest">🔊 Âm thanh</h3>
                        <label class="block mb-3">
                            <span class="flex justify-between text-xs uppercase tracking-widest mb-1"><span>Âm lượng chung</span><span data-out="master">${Math.round(audio.master*100)}%</span></span>
                            <input type="range" min="0" max="100" value="${Math.round(audio.master*100)}" data-set="master" class="w-full">
                        </label>
                        <label class="block mb-3">
                            <span class="flex justify-between text-xs uppercase tracking-widest mb-1"><span>Hiệu ứng (SFX)</span><span data-out="sfx">${Math.round(audio.sfx*100)}%</span></span>
                            <input type="range" min="0" max="100" value="${Math.round(audio.sfx*100)}" data-set="sfx" class="w-full">
                        </label>
                        <label class="block mb-3">
                            <span class="flex justify-between text-xs uppercase tracking-widest mb-1"><span>Nhạc nền (BGM)</span><span data-out="bgm">${Math.round(audio.bgm*100)}%</span></span>
                            <input type="range" min="0" max="100" value="${Math.round(audio.bgm*100)}" data-set="bgm" class="w-full">
                        </label>
                        <div class="flex flex-wrap gap-3 mt-2">
                            <label class="flex items-center gap-2 text-xs uppercase tracking-widest"><input type="checkbox" data-toggle="muted" ${audio.muted?'checked':''}> Tắt toàn bộ âm thanh</label>
                            <label class="flex items-center gap-2 text-xs uppercase tracking-widest"><input type="checkbox" data-toggle="bgmEnabled" ${cfg.bgmEnabled?'checked':''}> Bật nhạc nền</label>
                        </div>
                    </div>

                    <div class="border-t border-slate-900/10 pt-5">
                        <h3 class="text-indigo-600 text-sm font-black mb-3 uppercase tracking-widest">🎮 Đồ hoạ &amp; Hiệu ứng</h3>
                        <div class="mb-3">
                            <span class="block text-xs uppercase tracking-widest mb-2">Mức đồ hoạ</span>
                            <div class="flex gap-2" role="radiogroup" aria-label="Mức đồ hoạ">
                                ${['low','med','high'].map(t => `
                                    <button data-graphics="${t}" class="flex-1 py-2 rounded-lg font-black text-xs uppercase tracking-widest transition-all ${cfg.graphics===t?'bg-indigo-600 text-white':'bg-slate-900/10 text-slate-700 hover:bg-slate-900/20'}">${t==='low'?'Thấp':t==='med'?'Vừa':'Cao'}</button>
                                `).join('')}
                            </div>
                        </div>
                        <div class="mb-3">
                            <span class="block text-xs uppercase tracking-widest mb-2">Tốc độ animation</span>
                            <div class="flex gap-2" role="radiogroup" aria-label="Tốc độ animation">
                                ${[{v:0,l:'Bỏ qua'},{v:1,l:'1x'},{v:2,l:'2x'}].map(o => `
                                    <button data-anim="${o.v}" class="flex-1 py-2 rounded-lg font-black text-xs uppercase tracking-widest transition-all ${cfg.animSpeed===o.v?'bg-indigo-600 text-white':'bg-slate-900/10 text-slate-700 hover:bg-slate-900/20'}">${o.l}</button>
                                `).join('')}
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-3">
                            <label class="flex items-center gap-2 text-xs uppercase tracking-widest"><input type="checkbox" data-toggle="reducedMotion" ${cfg.reducedMotion?'checked':''}> Giảm chuyển động</label>
                            <label class="flex items-center gap-2 text-xs uppercase tracking-widest"><input type="checkbox" data-toggle="haptics" ${cfg.haptics?'checked':''}> Rung (mobile)</label>
                        </div>
                    </div>

                    <div class="border-t border-slate-900/10 pt-5">
                        <h3 class="text-indigo-600 text-sm font-black mb-3 uppercase tracking-widest">♿ Trợ năng</h3>
                        <div class="flex flex-wrap gap-3">
                            <label class="flex items-center gap-2 text-xs uppercase tracking-widest"><input type="checkbox" data-toggle="colorBlind" ${cfg.colorBlind?'checked':''}> Chế độ mù màu (pattern)</label>
                            <label class="flex items-center gap-2 text-xs uppercase tracking-widest"><input type="checkbox" data-toggle="highContrast" ${cfg.highContrast?'checked':''}> Tương phản cao</label>
                        </div>
                    </div>

                    <div class="border-t border-slate-900/10 pt-5">
                        <h3 class="text-indigo-600 text-sm font-black mb-3 uppercase tracking-widest">💾 Lưu trữ</h3>
                        <label class="flex items-center gap-2 text-xs uppercase tracking-widest"><input type="checkbox" data-toggle="autoSave" ${cfg.autoSave?'checked':''}> Tự lưu ván chơi</label>
                    </div>
                </section>

                <div class="mt-8 flex gap-3">
                    <button data-close-settings class="flex-1 py-4 bg-white/20 hover:bg-white/30 text-slate-800 font-black uppercase tracking-widest rounded-2xl transition-all border border-white/30">Đóng</button>
                    <button id="settings-reset" class="py-4 px-6 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all">Mặc định</button>
                </div>
            </div>
        </div>`;

        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        document.body.appendChild(wrap.firstElementChild);
        wirePanel();
    }

    function open() {
        buildPanel();
        const el = document.getElementById(PANEL_ID);
        if (el) el.classList.remove('hidden');
        document.body.classList.add('modal-open');
        if (window.SoundFX) window.SoundFX.click();
    }

    function close() {
        const el = document.getElementById(PANEL_ID);
        if (el) el.classList.add('hidden');
        document.body.classList.remove('modal-open');
        if (window.SoundFX) window.SoundFX.click();
    }

    function wirePanel() {
        const el = document.getElementById(PANEL_ID);
        if (!el) return;

        el.querySelectorAll('[data-close-settings]').forEach(b => {
            b.addEventListener('click', close);
        });
        el.addEventListener('click', (e) => { if (e.target === el) close(); });

        // Volume sliders
        el.querySelectorAll('input[type=range][data-set]').forEach(input => {
            input.addEventListener('input', () => {
                const ch = input.dataset.set;
                const v = parseInt(input.value, 10) / 100;
                const out = el.querySelector(`[data-out="${ch}"]`);
                if (out) out.textContent = `${input.value}%`;
                if (!window.SoundFX) return;
                if (ch === 'master') window.SoundFX.setMaster(v);
                if (ch === 'sfx')    window.SoundFX.setSfx(v);
                if (ch === 'bgm')    window.SoundFX.setBgm(v);
            });
        });

        // Toggles
        el.querySelectorAll('input[type=checkbox][data-toggle]').forEach(cb => {
            cb.addEventListener('change', () => {
                const key = cb.dataset.toggle;
                const val = cb.checked;
                if (key === 'muted') {
                    if (window.SoundFX) window.SoundFX.setMuted(val);
                } else {
                    Settings.set(key, val);
                    if (key === 'bgmEnabled' && window.SoundFX) {
                        val ? window.SoundFX.startBGM() : window.SoundFX.stopBGM();
                    }
                }
            });
        });

        // Graphics tier buttons
        el.querySelectorAll('button[data-graphics]').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.dataset.graphics;
                Settings.set('graphics', t);
                el.querySelectorAll('button[data-graphics]').forEach(b => {
                    const active = b.dataset.graphics === t;
                    b.className = `flex-1 py-2 rounded-lg font-black text-xs uppercase tracking-widest transition-all ${active?'bg-indigo-600 text-white':'bg-slate-900/10 text-slate-700 hover:bg-slate-900/20'}`;
                });
            });
        });

        // Anim speed buttons
        el.querySelectorAll('button[data-anim]').forEach(btn => {
            btn.addEventListener('click', () => {
                const v = parseInt(btn.dataset.anim, 10);
                Settings.set('animSpeed', v);
                el.querySelectorAll('button[data-anim]').forEach(b => {
                    const active = parseInt(b.dataset.anim, 10) === v;
                    b.className = `flex-1 py-2 rounded-lg font-black text-xs uppercase tracking-widest transition-all ${active?'bg-indigo-600 text-white':'bg-slate-900/10 text-slate-700 hover:bg-slate-900/20'}`;
                });
            });
        });

        const resetBtn = el.querySelector('#settings-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                try { localStorage.removeItem('monopoly3d_settings_v1'); } catch (e) {}
                try { localStorage.removeItem('monopoly3d_audio_v1'); } catch (e) {}
                location.reload();
            });
        }
    }

    // Esc to close
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const el = document.getElementById(PANEL_ID);
        if (el && !el.classList.contains('hidden')) close();
    });

    window.SettingsUI = { open, close };
})();
