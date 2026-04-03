document.addEventListener('DOMContentLoaded', () => {
    const donorCountEl = document.getElementById('donor-count');
    const recipientCountEl = document.getElementById('recipient-count');
    const bothCountEl = document.getElementById('both-count');
    const totalCountEl = document.getElementById('total-count');
    const availabilityListEl = document.getElementById('availability-list');
    const noResultsEl = document.getElementById('no-results');

    const filterType = document.getElementById('filter-type');
    const filterBlood = document.getElementById('filter-blood');
    const filterCity = document.getElementById('filter-city');

    // Helper: format date
    function formatDate(d) {
        if (!d) return 'N/A';
        try {
            const dt = new Date(d);
            return dt.toLocaleDateString();
        } catch (e) { return d; }
    }

    async function fetchSummary() {
        try {
            const res = await fetch('/api/donors/summary');
            if (!res.ok) throw new Error('Failed to load summary');
            const json = await res.json();
            donorCountEl.textContent = json.donorsAvailable || 0;
            recipientCountEl.textContent = json.recipients || 0;
            bothCountEl.textContent = json.both || 0;
            totalCountEl.textContent = json.total || 0;
        } catch (err) {
            console.error('Summary load error', err);
        }
    }

    // Build query and fetch donors list based on filters
    async function fetchList() {
        const type = (filterType && filterType.value) || 'all';
        const blood = (filterBlood && filterBlood.value) || 'all';
        const city = (filterCity && filterCity.value) || 'all';

        const qs = new URLSearchParams();
        if (type) qs.set('type', type);
        if (blood) qs.set('bloodGroup', blood);
        if (city) qs.set('city', city);

        try {
            const res = await fetch('/api/donors?' + qs.toString());
            if (!res.ok) throw new Error('Failed to load donors');
            const donors = await res.json();
            renderList(donors);
        } catch (err) {
            console.error('Donors load error', err);
            availabilityListEl.innerHTML = '<p style="color:#c0392b;padding:16px">Error loading donors. Try again later.</p>';
            noResultsEl.style.display = 'none';
        }
    }

    function renderList(donors) {
        availabilityListEl.innerHTML = '';
        if (!donors || donors.length === 0) {
            noResultsEl.style.display = 'block';
            return;
        }
        noResultsEl.style.display = 'none';

        donors.forEach(d => {
            const card = document.createElement('div');
            card.className = 'availability-card';
            // Use computed effective availability if provided by the server
            const effectiveAvailable = (typeof d.is_effectively_available !== 'undefined') ? !!d.is_effectively_available : !!d.is_available;

            card.innerHTML = `
                <div class="card-left">
                    <h3 class="card-name">${escapeHtml(d.name || 'Unknown')}</h3>
                    <p class="card-meta">${escapeHtml(d.blood_group || '')} • ${escapeHtml([d.area, d.city, d.pincode].filter(Boolean).join(', '))}</p>
                    <p class="card-last">Last Donation: ${formatDate(d.last_donation)}</p>
                </div>
                <div class="card-right">
                    <button class="toggle-availability ${effectiveAvailable ? 'available' : 'unavailable'}" data-id="${d.id}">${effectiveAvailable ? 'Available' : 'Unavailable'}</button>
                    <a class="contact-link" href="tel:${d.phone || ''}"><i class="fa-solid fa-phone"></i> ${d.phone || 'No Phone'}</a>
                </div>
            `;

            // Toggle availability handler
            const btn = card.querySelector('.toggle-availability');
            btn.addEventListener('click', async (ev) => {
                const donorId = btn.dataset.id;
                const newState = !(btn.classList.contains('available'));
                try {
                    btn.disabled = true;
                    const resp = await fetch(`/api/donor/${donorId}/availability`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ isAvailable: newState })
                    });
                    if (!resp.ok) throw new Error('Failed to update');
                    // Update UI optimistically
                    btn.classList.toggle('available', newState);
                    btn.classList.toggle('unavailable', !newState);
                    btn.textContent = newState ? 'Available' : 'Unavailable';
                    // Refresh summary counts
                    fetchSummary();
                } catch (err) {
                    console.error('Toggle availability error', err);
                    // if server returned a helpful message, show it
                    try {
                        if (typeof resp !== 'undefined' && resp && resp.json) {
                            const data = await resp.json();
                            alert(data.message || 'Could not update availability.');
                        } else {
                            alert('Could not update availability.');
                        }
                    } catch (e) {
                        alert('Could not update availability.');
                    }
                } finally {
                    btn.disabled = false;
                }
            });

            availabilityListEl.appendChild(card);
        });
    }

    // Simple HTML escaper for safety
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, (s) => {
            return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]);
        });
    }

    // Called from inline onclick in HTML
    window.applyFilters = function() {
        fetchList();
        fetchSummary();
    };

    window.clearFilters = function() {
        if (filterType) filterType.value = 'all';
        if (filterBlood) filterBlood.value = 'all';
        if (filterCity) filterCity.value = 'all';
        fetchList();
        fetchSummary();
    };

    // Initial load
    fetchSummary();
    fetchList();

    // Periodic refresh every 60s
    setInterval(() => {
        fetchSummary();
        fetchList();
    }, 60000);
});
