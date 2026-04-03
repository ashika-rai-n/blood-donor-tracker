// Dashboard UI controller
// Behavior:
// - If a panel is an <a> without a data-target, allow normal navigation.
// - If a panel has data-target, load the appropriate fragment (e.g., "find.html") into the matching .panel-content.
// - If fragment isn't available, show a friendly placeholder.
// - Execute any scripts found in fetched fragments.
document.addEventListener('DOMContentLoaded', () => {
    // Only attach the inline-loading click handler to panels that explicitly
    // opt-in via a data-target="..." attribute. Anchor panels (links) will
    // not receive this handler and will perform normal navigation.
    const panels = Array.from(document.querySelectorAll('.panel[data-target]'));
    const contents = Array.from(document.querySelectorAll('.panel-content'));

    function clearActive() {
        panels.forEach(p => p.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
    }

    function execScriptsFromDoc(doc) {
        const scripts = Array.from(doc.scripts || []);
        scripts.forEach(s => {
            const newScript = document.createElement('script');
            if (s.src) {
                newScript.src = s.src;
                if (s.async) newScript.async = true;
                if (s.defer) newScript.defer = true;
            } else {
                newScript.textContent = s.textContent;
            }
            document.body.appendChild(newScript);
        });
    }

    function showPlaceholder(targetEl, title) {
        targetEl.innerHTML = `<div style="padding:24px;">
            <h2 style="color:#e74c3c;">${title}</h2>
            <p style="color:#333;">This panel is not yet implemented. You can return to the dashboard or try another panel.</p>
        </div>`;
        targetEl.dataset.loaded = 'true';
    }

    // Try to fetch several candidate fragment filenames derived from the data-target
    function loadFragment(targetEl, fragmentBase) {
        if (!targetEl) return Promise.reject(new Error('No target element'));
        if (targetEl.dataset.loaded === 'true') return Promise.resolve();

        const candidates = [];
        candidates.push(`${fragmentBase}.html`);
        // try without suffixes like '-donor'
        if (fragmentBase.endsWith('-donor')) candidates.push(`${fragmentBase.replace(/-donor$/, '')}.html`);
        // try collapse hyphens
        if (fragmentBase.includes('-')) candidates.push(`${fragmentBase.replace(/-/g, '')}.html`);

        // unique
        const unique = Array.from(new Set(candidates));

        return new Promise((resolve) => {
            (function tryOne(i) {
                if (i >= unique.length) {
                    resolve(false);
                    return;
                }
                const url = unique[i];
                fetch(url)
                    .then(res => {
                        if (!res.ok) throw new Error('fetch failed ' + res.status);
                        return res.text();
                    })
                    .then(html => {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, 'text/html');
                        // Inject the body content of fragment into target
                        targetEl.innerHTML = doc.body.innerHTML;
                        execScriptsFromDoc(doc);
                        targetEl.dataset.loaded = 'true';
                        resolve(true);
                    })
                    .catch(() => tryOne(i + 1));
            })(0);
        });
    }

    // Click handling for panels that have a data-target (we selected only those above)
    panels.forEach(panel => {
        panel.addEventListener('click', async (e) => {
            const targetId = panel.dataset.target;

            // For panels with a data-target, prevent default navigation and load inline
            if (e && e.preventDefault) e.preventDefault();

            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;

            clearActive();
            panel.classList.add('active');
            targetEl.classList.add('active');

            const fragmentBase = targetId.replace(/^content-/, '');
            const loaded = await loadFragment(targetEl, fragmentBase);
            if (!loaded) {
                showPlaceholder(targetEl, fragmentBase.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
            }
        });
    });

    // Optionally auto-open a panel requested by hash, e.g. #find => panel-find-donor
    function openPanelFromHash() {
        const h = (location.hash || '').replace(/^#/, '');
        if (!h) return;
        // map simple names -> panel ids
        const map = {
            'find': 'panel-find-donor'
        };
        const panelId = map[h];
        if (!panelId) return;
        const p = document.getElementById(panelId);
        if (p) p.click();
    }

    window.addEventListener('hashchange', openPanelFromHash);
    // try open on load if hash present
    if (location.hash) openPanelFromHash();

    // About button: navigate to about page
    const aboutBtn = document.getElementById('about-btn');
    if (aboutBtn) {
        aboutBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            window.location.href = 'about.html';
        });
    }

    // Logout handler: clear client-side auth state and redirect to login page
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            try {
                // Remove keys we set during login
                localStorage.removeItem('donorId');
                localStorage.removeItem('donorName');
                // If other pages use sessionStorage or additional keys, clear them here
                // sessionStorage.clear(); // <-- enable if you want to wipe sessionStorage too
            } catch (err) {
                console.warn('Error clearing local storage during logout', err);
            }
            // Redirect to the login page
            window.location.href = 'login.html';
        });
    }
});
