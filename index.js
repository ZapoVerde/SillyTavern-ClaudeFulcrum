(function () {
    'use strict';

    const CFM_BUILD = '20260611-1';
    console.log('[CFM] IIFE executing — build:', CFM_BUILD, '| readyState:', document.readyState, '| viewport:', window.innerWidth + 'x' + window.innerHeight);

    const PLUGIN_BASE    = '/api/plugins/claudefulcrum';
    const EXT_SETTINGS_KEY = 'claudefulcrum';
    let _mode         = 'cc';
    let _activeTask   = null;  // { taskId, eventSource }
    let _pendingTask  = null;  // { taskId, tools } — waiting for pre-run approval

    function _getSettings() {
        if (!window.extension_settings) return {};
        if (!window.extension_settings[EXT_SETTINGS_KEY]) {
            window.extension_settings[EXT_SETTINGS_KEY] = { enabled: true };
        }
        return window.extension_settings[EXT_SETTINGS_KEY];
    }

    // Follow the same pattern as other ST extensions (e.g. Personalyze):
    // use getRequestHeaders() from the ST context directly rather than fetching
    // /csrf-token separately. A separate fetch risks Cloudflare edge-caching the
    // response and stripping the Set-Cookie that binds the token to the session.
    function _postHeaders() {
        const ctx = window.SillyTavern?.getContext?.();
        return ctx?.getRequestHeaders?.() ?? { 'Content-Type': 'application/json', 'X-CSRF-Token': '' };
    }

    // ─── ST extension entry ───────────────────────────────────────────────────

    async function init() {
        console.log('[CFM] init() called');
        const ctx = window.SillyTavern?.getContext?.();
        if (!ctx) { console.warn('[CFM] init: no ST context'); return; }
        if (document.getElementById('cfm-window')) { console.log('[CFM] init: already initialized'); return; }

        let html;
        try {
            html = await ctx.renderExtensionTemplateAsync('third-party/SillyTavern-ClaudeFulcrum', 'window');
            console.log('[CFM] template loaded, length:', html?.length);
        } catch (err) {
            console.error('[CFM] renderExtensionTemplateAsync failed:', err.message);
            return;
        }
        document.body.insertAdjacentHTML('beforeend', html);
        const win0 = document.getElementById('cfm-window');
        console.log('[CFM] window in DOM:', !!win0, '| inline display after insert:', win0?.style.display, '| computed:', win0 ? getComputedStyle(win0).display : 'N/A');

        _bindEvents();
        await _loadPresets();
        await _checkStatus();
        _injectWandButton();
        _injectSettings();
        console.log('[CFM] wand btn in DOM:', !!document.getElementById('cfm-wand-btn'));

        // If disabled, hide the wand button immediately
        if (_getSettings().enabled === false) {
            const btn = document.getElementById('cfm-wand-btn');
            if (btn) btn.style.display = 'none';
        }
    }

    // ─── Wand menu button ─────────────────────────────────────────────────────

    function _injectWandButton() {
        if (document.getElementById('cfm-wand-btn')) { console.log('[CFM] wand btn already exists'); return; }
        const menu = document.getElementById('extensionsMenu');
        if (!menu) { console.warn('[CFM] #extensionsMenu not found — wand button not injected'); return; }
        console.log('[CFM] #extensionsMenu found, children:', menu.children.length);

        const btn = document.createElement('div');
        btn.id        = 'cfm-wand-btn';
        btn.className = 'list-group-item flex-container flexGap5';
        btn.title     = 'Open ClaudeFulcrum';
        btn.innerHTML = '<i class="fa-solid fa-bolt"></i><span>ClaudeFulcrum</span>';
        btn.addEventListener('click', () => {
            const win = document.getElementById('cfm-window');
            console.log('[CFM] wand click — win found:', !!win, '| hidden:', win?.classList.contains('cfm-hidden'));
            if (!win) { console.warn('[CFM] #cfm-window missing from DOM'); return; }
            const isHidden = win.classList.contains('cfm-hidden');
            setTimeout(() => {
                if (isHidden) {
                    win.classList.remove('cfm-hidden');
                } else {
                    win.classList.add('cfm-hidden');
                }
                const cs   = getComputedStyle(win);
                const rect = win.getBoundingClientRect();
                console.log('[CFM] after 50ms — hidden class:', win.classList.contains('cfm-hidden'), '| computed display:', cs.display);
                console.log('[CFM] geometry — rect:', JSON.stringify({t:Math.round(rect.top),l:Math.round(rect.left),w:Math.round(rect.width),h:Math.round(rect.height)}), '| z:', cs.zIndex);
            }, 50);
        });
        menu.appendChild(btn);
    }

    // ─── Settings panel injection (Characteryze pattern) ─────────────────────

    function _injectSettings() {
        if (document.getElementById('cfm-settings-block')) return;
        const target = document.getElementById('extensions_settings');
        if (!target) { console.warn('[CFM] #extensions_settings not found'); return; }

        const isEnabled = _getSettings().enabled !== false;
        const wrapper = document.createElement('div');
        wrapper.id = 'cfm-settings-block';
        wrapper.innerHTML = `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>ClaudeFulcrum</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="flex-container alignItemsCenter" style="margin-bottom:8px">
                        <label class="checkbox_label">
                            <input type="checkbox" id="cfm-master-enable" ${isEnabled ? 'checked' : ''}>
                            <span>Enable ClaudeFulcrum</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
        target.appendChild(wrapper);

        $(document).on('change', '#cfm-master-enable', function () {
            const enabled = $(this).is(':checked');
            _getSettings().enabled = enabled;
            window.saveSettingsDebounced?.();
            const btn = document.getElementById('cfm-wand-btn');
            const win = document.getElementById('cfm-window');
            if (btn) btn.style.display = enabled ? '' : 'none';
            if (!enabled && win) win.classList.add('cfm-hidden');
        });
    }

    // ─── Preset loading ───────────────────────────────────────────────────────

    async function _loadPresets() {
        try {
            const res     = await fetch(`${PLUGIN_BASE}/presets`);
            const presets = await res.json();
            const bar     = document.getElementById('cfm-presets');
            bar.innerHTML = '';
            for (const p of presets) {
                if (p.id === 'freeform') continue;
                const btn = document.createElement('button');
                btn.className   = 'cfm-preset-btn';
                btn.textContent = p.label;
                btn.dataset.id  = p.id;
                btn.addEventListener('click', () => _runPreset(p.id));
                bar.appendChild(btn);
            }
        } catch {}
    }

    // ─── Status check ─────────────────────────────────────────────────────────

    async function _checkStatus() {
        const dot = document.getElementById('cfm-status-dot');
        try {
            const res  = await fetch(`${PLUGIN_BASE}/status`);
            const data = await res.json();
            if (data.binaryOk) {
                dot.className = 'cfm-status-dot ready';
                dot.title     = 'CC ready';
            } else {
                dot.className = 'cfm-status-dot error';
                dot.title     = 'CC binary not found — run: cd plugin && npm install';
            }
        } catch {
            dot.className = 'cfm-status-dot error';
            dot.title     = 'Plugin not reachable';
        }
    }

    // ─── Run a preset ─────────────────────────────────────────────────────────

    async function _runPreset(presetId) {
        if (_activeTask) return;
        _clearOutput();
        await _startTask({ presetId, prompt: '', mode: _mode });
    }

    async function _runFreeform() {
        const input = document.getElementById('cfm-input');
        const text  = input.value.trim();
        if (!text || _activeTask) return;
        input.value = '';
        _clearOutput();
        await _startTask({ presetId: null, prompt: text, mode: _mode });
    }

    // ─── Task lifecycle ───────────────────────────────────────────────────────

    async function _startTask(body) {
        try {
            const res  = await fetch(`${PLUGIN_BASE}/run`, {
                method:  'POST',
                headers: _postHeaders(),
                body:    JSON.stringify(body),
            });
            if (res.status === 403) { _appendMsg('error', 'CSRF error — please refresh the page.'); return; }
            if (!res.ok) { _appendMsg('error', `Server error ${res.status}`); return; }
            const data = await res.json();
            console.log('[CFM] /run response:', JSON.stringify(data));
            if (!data.taskId) { _appendMsg('error', 'Failed to start task.'); return; }

            if (data.needsApproval) {
                _pendingTask = data;
                _showApproval(data);
            } else {
                _connectStream(data.taskId);
            }
        } catch (err) {
            _appendMsg('error', `Error: ${err.message}`);
        }
    }

    function _showApproval(data) {
        const bar   = document.getElementById('cfm-approval-bar');
        const label = document.getElementById('cfm-approval-label');
        const tier2 = data.tools.filter(t => t.tier >= 2).map(t => t.name);
        label.textContent = `This task needs write access: ${tier2.join(', ')}. Allow?`;
        bar.style.display = 'flex';
    }

    function _hideApproval() {
        document.getElementById('cfm-approval-bar').style.display = 'none';
        _pendingTask = null;
    }

    async function _approve(approved) {
        if (!_pendingTask) return;
        const { taskId } = _pendingTask;
        _hideApproval();

        await fetch(`${PLUGIN_BASE}/approve`, {
            method:  'POST',
            headers: _postHeaders(),
            body:    JSON.stringify({ taskId, approved }),
        });

        if (approved) _connectStream(taskId);
        else _appendMsg('warn', 'Task cancelled.');
    }

    function _safeParse(data, fallback = {}) {
        if (data == null) return fallback;
        try { return JSON.parse(data); } catch { return fallback; }
    }

    function _connectStream(taskId) {
        _setRunning(true);
        const url = `${PLUGIN_BASE}/stream?taskId=${taskId}`;
        console.log('[CFM] connecting SSE:', url);
        const es = new EventSource(url);
        _activeTask = { taskId, eventSource: es };

        es.addEventListener('open', () => {
            console.log('[CFM] SSE open — readyState:', es.readyState);
        });

        es.addEventListener('event', (e) => {
            const ev = _safeParse(e.data);
            _handleEvent(ev);
        });

        es.addEventListener('warning', (e) => {
            const d = _safeParse(e.data);
            _appendMsg('warn', `⚠ ${d.message ?? e.data}`);
        });

        es.addEventListener('error', (e) => {
            const d = _safeParse(e.data);
            _appendMsg('error', `✗ ${d.message ?? e.data ?? 'stream error'}`);
        });

        es.addEventListener('done', (e) => {
            const d = _safeParse(e.data);
            const label = d.subtype === 'cancelled' ? 'Cancelled.' : d.subtype === 'error' ? 'Task failed.' : 'Done.';
            _appendMsg('done', label);
            _setRunning(false);
            es.close();
            _activeTask = null;
        });

        es.onerror = (e) => {
            console.log('[CFM] SSE onerror — readyState:', es.readyState, '| data:', e.data, '| type:', e.type);
            if (_activeTask) {
                _appendMsg('error', `Connection error (readyState ${es.readyState})`);
                _setRunning(false);
                es.close();
                _activeTask = null;
            }
        };
    }

    function _handleEvent(ev) {
        if (!ev) return;
        if (ev.type === 'assistant' && ev.text) {
            _appendText(ev.text);
        } else if (ev.type === 'tool_use') {
            _appendMsg('tool', `[tool: ${ev.name}]`);
        } else if (ev.type === 'error') {
            _appendMsg('error', `✗ ${ev.message || JSON.stringify(ev)}`);
        } else if (ev.type === 'debug') {
            // suppress debug lines
        }
    }

    // ─── Cancel ───────────────────────────────────────────────────────────────

    async function _cancel() {
        if (!_activeTask) return;
        const { taskId, eventSource } = _activeTask;
        eventSource.close();
        _activeTask = null;
        await fetch(`${PLUGIN_BASE}/cancel`, {
            method:  'POST',
            headers: _postHeaders(),
            body:    JSON.stringify({ taskId }),
        });
        _setRunning(false);
        _appendMsg('warn', 'Stopped.');
    }

    // ─── Output helpers ───────────────────────────────────────────────────────

    let _textNode = null;

    function _clearOutput() {
        const out = document.getElementById('cfm-output');
        out.innerHTML = '<div class="cfm-output-empty" id="cfm-output-empty" style="display:none"></div>';
        _textNode = null;
    }

    function _appendText(text) {
        document.getElementById('cfm-output-empty')?.remove();
        const out = document.getElementById('cfm-output');
        if (!_textNode) {
            const div = document.createElement('div');
            div.className = 'cfm-msg';
            out.appendChild(div);
            _textNode = div;
        }
        _textNode.textContent += text;
        out.scrollTop = out.scrollHeight;
    }

    function _appendMsg(type, text) {
        _textNode = null;
        document.getElementById('cfm-output-empty')?.remove();
        const out  = document.getElementById('cfm-output');
        const div  = document.createElement('div');
        div.className   = `cfm-msg cfm-msg-${type}`;
        div.textContent = text;
        out.appendChild(div);
        out.scrollTop = out.scrollHeight;
    }

    // ─── UI state ─────────────────────────────────────────────────────────────

    function _setRunning(running) {
        document.getElementById('cfm-thinking-bar').style.display = running ? 'flex' : 'none';
        document.getElementById('cfm-send-btn').disabled = running;
    }

    // ─── Drag (desktop only) ──────────────────────────────────────────────────

    function _initDrag() {
        if (window.matchMedia('(max-width: 640px)').matches) return;
        const win    = document.getElementById('cfm-window');
        const handle = document.getElementById('cfm-drag-handle');
        let ox = 0, oy = 0;

        const onStart = (cx, cy, e) => {
            if (e.target.closest('button')) return;
            ox = cx - win.offsetLeft;
            oy = cy - win.offsetTop;
        };
        const onMove = (cx, cy) => {
            win.style.left  = `${cx - ox}px`;
            win.style.top   = `${cy - oy}px`;
            win.style.right = 'auto';
        };

        handle.addEventListener('mousedown', (e) => {
            onStart(e.clientX, e.clientY, e);
            const move = (me) => onMove(me.clientX, me.clientY);
            const up   = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });

        handle.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            onStart(t.clientX, t.clientY, e);
        }, { passive: true });
        handle.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            onMove(t.clientX, t.clientY);
            e.preventDefault();
        }, { passive: false });
    }

    // ─── Resize (desktop only) ────────────────────────────────────────────────

    function _initResize() {
        if (window.matchMedia('(max-width: 640px)').matches) return;
        const win = document.getElementById('cfm-window');
        win.querySelectorAll('.cfm-rh').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const dir    = [...handle.classList].find(c => c.startsWith('cfm-rh-') && c !== 'cfm-rh').replace('cfm-rh-', '');
                const startX = e.clientX, startY = e.clientY;
                const startW = win.offsetWidth, startH = win.offsetHeight;
                const startL = win.offsetLeft,  startT = win.offsetTop;

                const move = (me) => {
                    const dx = me.clientX - startX;
                    const dy = me.clientY - startY;
                    if (dir.includes('e')) win.style.width  = `${Math.max(320, startW + dx)}px`;
                    if (dir.includes('s')) win.style.height = `${Math.max(300, startH + dy)}px`;
                    if (dir.includes('w')) { win.style.width = `${Math.max(320, startW - dx)}px`; win.style.left = `${startL + dx}px`; }
                    if (dir.includes('n')) { win.style.height = `${Math.max(300, startH - dy)}px`; win.style.top = `${startT + dy}px`; }
                };
                const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up);
            });
        });
    }

    // ─── Event binding ────────────────────────────────────────────────────────

    function _bindEvents() {
        // Prevent clicks inside the panel bleeding into ST's document handlers
        const win = document.getElementById('cfm-window');
        win.addEventListener('click', e => e.stopPropagation());

        // Panel close/minimize — both just hide, wand menu reopens
        const _hide = () => win.classList.add('cfm-hidden');
        document.getElementById('cfm-close-btn').addEventListener('click', _hide);
        document.getElementById('cfm-min-btn').addEventListener('click', _hide);

        // Mode toggle
        document.getElementById('cfm-mode-btn').addEventListener('click', () => {
            _mode = _mode === 'cc' ? 'direct' : 'cc';
            const btn = document.getElementById('cfm-mode-btn');
            btn.textContent = _mode.toUpperCase();
            btn.classList.toggle('direct', _mode === 'direct');
        });

        // Input
        const input = document.getElementById('cfm-input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _runFreeform(); }
        });
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
        });

        document.getElementById('cfm-send-btn').addEventListener('click', _runFreeform);
        document.getElementById('cfm-stop-btn').addEventListener('click', _cancel);

        // Approval
        document.getElementById('cfm-approve-btn').addEventListener('click', () => _approve(true));
        document.getElementById('cfm-deny-btn').addEventListener('click',    () => _approve(false));

        _initDrag();
        _initResize();
        _initMobileViewport();
    }

    // ─── Mobile viewport — Android nav bar clearance ──────────────────────────
    // env(safe-area-inset-bottom) requires viewport-fit=cover which ST doesn't
    // set, so it's always 0. Use visualViewport to measure the gap between
    // window.innerHeight and the actually-visible area instead.

    function _initMobileViewport() {
        if (!window.matchMedia('(max-width: 640px)').matches) return;
        if (!window.visualViewport) return;

        const win = document.getElementById('cfm-window');
        if (!win) return;

        const update = () => {
            const safeBottom = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
            win.style.setProperty('--cfm-safe-bottom', safeBottom + 'px');
        };

        window.visualViewport.addEventListener('resize', update);
        window.visualViewport.addEventListener('scroll', update);
        update();
    }

    // ─── Boot ─────────────────────────────────────────────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
