document.addEventListener('DOMContentLoaded', () => {
    const enrolledBtn = document.getElementById('toggle-request-enrolled');
    const manualBtn = document.getElementById('toggle-request-manual');
    const enrolledView = document.getElementById('enrolled-details-view');
    const manualView = document.getElementById('manual-details-view');
    const enrolledForm = document.getElementById('enrolled-request-form');
    const manualForm = document.getElementById('manual-request-form');
    const resultsSheet = document.getElementById('unified-results-sheet');
    const donorsBody = document.getElementById('unified-donors-body');
    const statusMsg = document.getElementById('request-status-message');

    // Helper to show view
    function showEnrolled(show) {
        enrolledBtn.classList.toggle('active', show);
        manualBtn.classList.toggle('active', !show);
        enrolledView.style.display = show ? 'block' : 'none';
        manualView.style.display = show ? 'none' : 'block';
    }

    enrolledBtn.addEventListener('click', () => showEnrolled(true));
    manualBtn.addEventListener('click', () => showEnrolled(false));

    // Populate enrolled details if user is logged in
    async function loadEnrolled() {
        const donorId = localStorage.getItem('donorId');
        if (!donorId) return;
        try {
            const res = await fetch(`/api/donor/${donorId}`);
            if (!res.ok) return;
            const d = await res.json();
            document.getElementById('req-enrolled-name').value = d.name || '';
            document.getElementById('req-enrolled-type').value = d.blood_group || '';
            document.getElementById('req-enrolled-city').value = d.city || '';
            document.getElementById('req-enrolled-area').value = d.area || '';
            document.getElementById('req-enrolled-pincode').value = d.pincode || '';
            // set enrolled contact phone if available
            const enrolledPhoneEl = document.getElementById('req-enrolled-phone');
            if (enrolledPhoneEl) enrolledPhoneEl.value = d.phone || '';
        } catch (err) {
            console.error('Failed to load enrolled donor', err);
        }
    }

    function clearResults() {
        donorsBody.innerHTML = '';
        statusMsg.textContent = '';
        resultsSheet.style.display = 'none';
    }

    // Render list of donors (from /api/donors/search)
    function renderDonors(rows) {
        donorsBody.innerHTML = '';
        if (!rows || rows.length === 0) {
            statusMsg.textContent = 'No matching donors found.';
            resultsSheet.style.display = 'block';
            return;
        }
        statusMsg.textContent = `Found ${rows.length} candidate donors.`;
        resultsSheet.style.display = 'block';

        rows.forEach((r, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td>${escapeHtml(r.name || '')}</td>
                <td>${escapeHtml(r.blood_group || '')}</td>
                <td>${escapeHtml([r.city, r.area, r.pincode].filter(Boolean).join(', '))}</td>
                <td>${escapeHtml(r.match_score ? 'Score: ' + r.match_score : (r.days_since_last_donation !== null ? (r.days_since_last_donation + ' days since last') : ''))}</td>
                <td>
                    <button class="btn-small notify-btn" data-id="${r.id}">Notify</button>
                </td>
            `;
            donorsBody.appendChild(tr);
        });

        // wire notify buttons
        Array.from(document.querySelectorAll('.notify-btn')).forEach(btn => {
            btn.addEventListener('click', async (ev) => {
                const donorId = btn.dataset.id;
                btn.disabled = true;
                try {
                    // Use requester info from currently visible form
                    const payload = getCurrentRequester();
                    const resp = await fetch(`/api/notify/${donorId}`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                    });
                    const data = await resp.json();
                    if (!resp.ok) throw new Error(data.message || 'Failed');
                    alert('Notification sent to donor.');
                } catch (err) {
                    console.error('Notify failed', err);
                    alert(err.message || 'Failed to notify donor');
                } finally {
                    btn.disabled = false;
                }
            });
        });
    }

    function getCurrentRequester() {
        if (enrolledView.style.display !== 'none') {
            return {
                requesterName: document.getElementById('req-enrolled-name').value,
                requesterBloodGroup: document.getElementById('req-enrolled-type').value,
                requesterCity: document.getElementById('req-enrolled-city').value,
                requesterPincode: document.getElementById('req-enrolled-pincode').value,
                requesterPhone: (document.getElementById('req-enrolled-phone') && document.getElementById('req-enrolled-phone').value) || ''
            };
        }
        return {
            requesterName: document.getElementById('req-manual-name').value,
            requesterBloodGroup: document.getElementById('req-manual-type').value,
            requesterCity: document.getElementById('req-manual-city').value,
            requesterPincode: document.getElementById('req-manual-pincode').value,
            requesterPhone: (document.getElementById('req-manual-phone') && document.getElementById('req-manual-phone').value) || ''
        };
    }

    // Submit flow: search donors and show results
    async function submitSearch(payload) {
        try {
            clearResults();
            statusMsg.textContent = 'Searching...';
            const res = await fetch('/api/donors/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Search failed');
            renderDonors(data);
        } catch (err) {
            console.error('Search failed', err);
            statusMsg.textContent = 'Search failed: ' + (err.message || 'Unknown error');
            resultsSheet.style.display = 'block';
        }
    }

    enrolledForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const p = getCurrentRequester();
        if (!p.requesterBloodGroup) { alert('Missing blood group'); return; }
        submitSearch({ bloodGroup: p.requesterBloodGroup, pincode: p.requesterPincode, city: p.requesterCity, area: '', excludeDonorId: localStorage.getItem('donorId') || null });
    });

    manualForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const p = getCurrentRequester();
        if (!p.requesterBloodGroup) { alert('Please select a blood group'); return; }
        submitSearch({ bloodGroup: p.requesterBloodGroup, pincode: p.requesterPincode, city: p.requesterCity, area: '', excludeDonorId: localStorage.getItem('donorId') || null });
    });

    // Broadcast notify (use server POST /api/request-blood)
    async function broadcastNotify(payload) {
        try {
            const res = await fetch('/api/request-blood', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Broadcast failed');
            alert(data.message || 'Broadcast sent');
        } catch (err) {
            console.error('Broadcast error', err);
            alert('Broadcast failed: ' + (err.message || 'Unknown'));
        }
    }

    // Attach a Broadcast button dynamically to results area
    function ensureBroadcastButton() {
        let btn = document.getElementById('broadcast-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'broadcast-btn';
            btn.className = 'btn-primary';
            btn.textContent = 'Broadcast to Closest Donors';
            btn.style.marginTop = '10px';
            resultsSheet.insertBefore(btn, resultsSheet.querySelector('.table-scroll-container'));
            btn.addEventListener('click', async () => {
                const payload = getCurrentRequester();
                if (!payload.requesterBloodGroup || !payload.requesterCity || !payload.requesterPincode) {
                    alert('Please provide blood group, city and pincode');
                    return;
                }
                await broadcastNotify(payload);
            });
        }
    }

    // Utility escaper
    function escapeHtml(s) { if (!s) return ''; return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]||c)); }

    // Init
    loadEnrolled();
    clearResults();
    // ensure broadcast button present when results shown
    const obs = new MutationObserver(() => { ensureBroadcastButton(); });
    obs.observe(resultsSheet, { childList: true, subtree: true });
});
