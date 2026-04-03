document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('donor-search-form');
    const resultsTableBody = document.getElementById('donor-results-body');
    const noResultsMessage = document.getElementById('no-results-message');

    // Helper to render one row
    const renderDonorRow = (donor) => {
        const lastDonatedText = donor.last_donation 
            ? `Last donated: ${new Date(donor.last_donation).toLocaleDateString()}` 
            : 'No previous donations recorded';
        
        const locationText = [donor.area, donor.city, donor.pincode].filter(Boolean).join(', ');
        
        // Determine the text/color for the last donation info
        let donationStatusStyle = 'color: #666;';
        let donationStatusIcon = '';
        if (donor.last_donation_warning) {
            donationStatusStyle = 'color: #c0392b; font-weight: 600;'; // Red warning
            donationStatusIcon = '<i class="fas fa-exclamation-circle"></i> ';
        } else if (donor.last_donation) {
            donationStatusIcon = '<i class="fas fa-tint"></i> ';
        }


        return `
            <tr>
                <td>
                    ${donor.name}
                    <div class="match-explanation" style="font-size: 0.8em; color: #3498db; margin-top: 5px;">
                        <i class="fas fa-bullseye"></i> Priority Score: ${donor.match_score || '0'} / 6
                    </div>
                </td>
                <td>
                    ${donor.blood_group}
                </td>
                <td>
                    ${locationText}
                </td>
                <td>
                    <div class="last-donation" style="font-size: 0.8em; ${donationStatusStyle}">
                        ${donationStatusIcon}${lastDonatedText}
                        ${donor.last_donation_warning ? ' (Donated < 90 days ago)' : ''}
                    </div>
                </td>
                <td>
                    ${donor.phone ? `<a href="tel:${donor.phone}" class="contact-link"><i class="fas fa-phone"></i> ${donor.phone}</a>` : ''}
                    ${donor.email ? `<a href="mailto:${donor.email}" class="contact-link"><i class="fas fa-envelope"></i> ${donor.email}</a>` : ''}
                </td>
            </tr>
        `;
    };

    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const bloodType = document.getElementById('blood-type-filter').value;
        if (!bloodType) {
            alert('Please select a Blood Type to search.');
            return;
        }

        // Show loading state
        resultsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Searching for donors...</td></tr>';
        noResultsMessage.style.display = 'none';

        // Collect search criteria (Map 'town' input to the 'city' DB field)
        const searchData = {
            bloodGroup: bloodType,
            pincode: document.getElementById('pincode-filter').value,
            area: document.getElementById('area-filter').value,
            city: document.getElementById('town-filter').value,
            // exclude current user from results if logged in
            excludeDonorId: localStorage.getItem('donorId') || null
        };

        try {
            // Note: Ensure the API endpoint matches your Node.js server port
            // Use a relative URL so this works whether served from localhost or another host
            const response = await fetch('/api/donors/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(searchData)
            });

            if (!response.ok) {
                // Try to parse JSON error, otherwise fallback to text/status
                let errorMsg = `Server returned ${response.status} ${response.statusText}`;
                try {
                    const maybeJson = await response.json();
                    if (maybeJson && maybeJson.message) errorMsg = maybeJson.message;
                } catch (err) {
                    try {
                        const txt = await response.text();
                        if (txt) errorMsg = txt;
                    } catch (__) {
                        /* ignore */
                    }
                }
                throw new Error(errorMsg || 'Search failed on the server.');
            }

            const donors = await response.json();

            if (donors.length === 0) {
                resultsTableBody.innerHTML = '';
                noResultsMessage.style.display = 'block';
                return;
            }

            // Render table rows
            const html = donors.map(renderDonorRow).join('');
            resultsTableBody.innerHTML = html;
            noResultsMessage.style.display = 'none';

        } catch (error) {
            console.error('Search error:', error);
            resultsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #c0392b; padding: 20px;">An error occurred while searching: ${error.message}.</td></tr>`;
        }
    });

    // Pincode validation
    const pincodeInput = document.getElementById('pincode-filter');
    if (pincodeInput) {
        pincodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
        });
    }
});