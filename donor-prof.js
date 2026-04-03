document.addEventListener('DOMContentLoaded', async () => {
    // 1. Get donorId from localStorage
    const donorId = localStorage.getItem('donorId');
    if (!donorId) {
        window.location.href = "login.html";
        return;
    }

    // Helper functions for safe access
    const safeSetText = (id, value) => {
        const el = document.getElementById(id);
        if (el) { // CRITICAL SAFETY CHECK
            el.textContent = (value === null || value === undefined || value === '') ? 'N/A' : value;
        }
    };
    
    const safeSetValue = (id, value) => {
        const el = document.getElementById(id);
        // CRITICAL SAFETY CHECK: Also check if it's an input element for .value
        if (el && el.tagName === 'INPUT') { 
            el.value = value || '';
        }
    };

    // Profile picture upload removed: no file input on profile page per user request

    // 2. Fetch donor data
    try {
        const res = await fetch(`http://localhost:3000/api/donor/${donorId}`);
        
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(`Server returned status ${res.status}: ${errorData.message}`);
        }
        
        const donor = await res.json();

        // 3. Populate the fields (SAFELY)
        safeSetText('reg-name', donor.name);
        safeSetText('reg-age', donor.age);
        safeSetText('reg-blood', donor.blood_group);
        safeSetText('reg-email', donor.email);
        safeSetText('reg-username', donor.email || donor.username || '');
        safeSetText('reg-phone', donor.phone);
        safeSetText('reg-district', donor.district); // Hidden span in donor-prof.html
    safeSetText('reg-state', donor.state);
    // Registration type display
    const typeDisplay = document.getElementById('reg-registration_type');
    if (typeDisplay) typeDisplay.textContent = donor.registration_type ? (donor.registration_type.charAt(0).toUpperCase() + donor.registration_type.slice(1)) : 'N/A';
    // Visible last donation display (readable text) and also set input if present
    const lastDisplay = document.getElementById('reg-last-donation-display');
    if (lastDisplay) lastDisplay.textContent = donor.last_donation ? new Date(donor.last_donation).toLocaleDateString() : 'N/A';
        safeSetText('reg-city', donor.city);
        safeSetText('reg-area', donor.area);
        safeSetText('reg-pincode', donor.pincode); // Hidden span in donor-prof.html
        
        // Full Address Field
        const addressEl = document.getElementById('donorAddress');
        if (addressEl) {
            addressEl.textContent = 
                [donor.area, donor.city, donor.pincode].filter(Boolean).join(', ');
        }

        // Initial availability button setup is now handled in the click handler section

        // Last donation date input setup
        const lastDonationInput = document.getElementById('lastDonation');
        if (lastDonationInput) {
            // Set initial value if exists (handle MySQL date format)
            if (donor.last_donation) {
                const date = new Date(donor.last_donation);
                lastDonationInput.value = date.toISOString().split('T')[0];
            }
            
            // Add change handler for last donation date
            lastDonationInput.addEventListener('change', async (e) => {
                const newDate = e.target.value;
                if (!newDate) return;

                try {
                    const response = await fetch(`http://localhost:3000/api/donor/${donorId}/last-donation`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lastDonation: newDate })
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.message || 'Failed to update last donation date');
                    }
                    
                    // Update the local state
                    donor.last_donation = newDate;
                    // Show success message
                    alert('Last donation date updated successfully!');
                } catch (err) {
                    console.error('Error updating last donation date:', err);
                    // Restore previous value on error
                    if (donor.last_donation) {
                        const date = new Date(donor.last_donation);
                        lastDonationInput.value = date.toISOString().split('T')[0];
                    } else {
                        lastDonationInput.value = '';
                    }
                    alert('Failed to update last donation date. Please try again.');
                }
            });
        }

        // Availability Button Setup and Click Handler
        const availBtn = document.getElementById('toggleAvailabilityBtn');
        if (availBtn) {
            // Initial state
            updateAvailabilityButton(availBtn, donor.is_available);
            
            // Click handler for availability toggle
            availBtn.addEventListener('click', async () => {
                try {
                    const newStatus = !donor.is_available;
                    const response = await fetch(`http://localhost:3000/api/donor/${donorId}/availability`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ isAvailable: newStatus })
                    });

                    if (!response.ok) throw new Error('Failed to update availability');

                    // Update local state and button UI
                    donor.is_available = newStatus;
                    updateAvailabilityButton(availBtn, newStatus);
                    
                    // Show success message
                    alert(`You are now ${newStatus ? 'available' : 'unavailable'} for donation.`);
                } catch (err) {
                    console.error('Error updating availability:', err);
                    alert('Failed to update availability status. Please try again.');
                }
            });
        }

        // Donation history: fetch and render
        const historyTable = document.getElementById('historyTable');
        async function loadDonationHistory() {
            if (!historyTable) return;
            try {
                const res = await fetch(`http://localhost:3000/api/donor/${donorId}/donations`);
                if (!res.ok) throw new Error('Failed to load donation history');
                const rows = await res.json();
                historyTable.innerHTML = rows.map(r => `
                    <tr>
                        <td>${new Date(r.date).toLocaleDateString()}</td>
                        <td>${donor.blood_group || ''}</td>
                        <td>${r.location || ''}</td>
                    </tr>
                `).join('');
            } catch (err) {
                console.error('Error loading donation history:', err);
            }
        }

        await loadDonationHistory();

        // Add donation button handler (simple prompts)
        const addDonationBtn = document.getElementById('addDonationBtn');
        if (addDonationBtn) {
            addDonationBtn.addEventListener('click', async () => {
                const donationDate = prompt('Enter donation date (YYYY-MM-DD)', new Date().toISOString().split('T')[0]);
                if (!donationDate) return;
                const location = prompt('Enter location (optional)', donor.city || '');
                try {
                    const res = await fetch(`http://localhost:3000/api/donor/${donorId}/donations`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ donationDate, location })
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.message || 'Failed to add donation');
                    }
                    alert('Donation record added');
                    // Update last donation input
                    const lastDonationInput = document.getElementById('lastDonation');
                    if (lastDonationInput) lastDonationInput.value = donationDate;
                    // Reload history
                    await loadDonationHistory();
                } catch (err) {
                    console.error('Error adding donation:', err);
                    alert('Failed to add donation record.');
                }
            });
        }

        // Profile picture upload handler
        const uploadPic = document.getElementById('uploadPic');
        const profilePic = document.getElementById('profilePic');
        if (uploadPic && profilePic) {
            uploadPic.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                // Check file type and size
                if (!file.type.startsWith('image/')) {
                    alert('Please upload an image file.');
                    return;
                }
                if (file.size > 5 * 1024 * 1024) {
                    alert('Image must be less than 5MB.');
                    return;
                }

                // Create FormData and append file
                const formData = new FormData();
                formData.append('profilePic', file);

                try {
                    const response = await fetch(`http://localhost:3000/api/donor/${donorId}/profile-picture`, {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) throw new Error('Failed to upload profile picture');

                    const data = await response.json();
                    // Update profile picture
                    profilePic.src = data.imageUrl;
                    alert('Profile picture updated successfully!');
                } catch (err) {
                    console.error('Error uploading profile picture:', err);
                    alert('Failed to upload profile picture. Please try again.');
                }
            });
        }

        // Edit Profile Button Handler (robust)
        const editBtn = document.getElementById('editBtn');
        if (editBtn) {
            let editing = false;
            const editableIds = ['reg-name','reg-age','reg-blood','reg-phone','reg-state','reg-district','reg-city','reg-area','reg-pincode','reg-registration_type'];

            editBtn.addEventListener('click', async () => {
                if (!editing) {
                    // Enter edit mode
                    editing = true;
                    editBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
                    editBtn.classList.add('editing');

                    // Replace spans with inputs
                    editableIds.forEach(id => {
                        const span = document.getElementById(id);
                        if (!span) return;
                        const value = span.textContent || '';
                        const input = document.createElement('input');
                        input.type = id === 'reg-age' ? 'number' : 'text';
                        input.className = 'edit-input';
                        input.dataset.fieldId = id;
                        input.value = value;
                        span.parentNode.replaceChild(input, span);
                    });
                } else {
                    // Save mode
                    try {
                        const inputs = Array.from(document.querySelectorAll('input.edit-input'));
                        const updates = {};
                        inputs.forEach(input => {
                            const id = input.dataset.fieldId;
                            const key = id.replace('reg-','');
                            // Map reg-blood -> blood_group
                            const mappedKey = key === 'blood' ? 'blood_group' : key;
                            updates[mappedKey] = input.value;
                        });

                        // Send updates (server will ignore unallowed fields)
                        const response = await fetch(`http://localhost:3000/api/donor/${donorId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(updates)
                        });
                        if (!response.ok) {
                            const err = await response.json().catch(()=>({message:'Failed'}));
                            throw new Error(err.message || 'Failed to update profile');
                        }

                        // Replace inputs with updated spans
                        inputs.forEach(input => {
                            const id = input.dataset.fieldId;
                            const span = document.createElement('span');
                            span.id = id;
                            span.textContent = input.value;
                            input.parentNode.replaceChild(span, input);
                        });

                        editing = false;
                        editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit Profile';
                        editBtn.classList.remove('editing');
                        alert('Profile updated successfully');
                    } catch (err) {
                        console.error('Error saving profile:', err);
                        alert('Failed to save profile changes.');
                    }
                }
            });
        }

        // Helper function to update availability button UI
        function updateAvailabilityButton(button, isAvailable) {
            if (isAvailable) {
                button.innerHTML = '<i class="fas fa-check-circle"></i> Available';
                button.classList.add('available');
                button.classList.remove('unavailable');
            } else {
                button.innerHTML = '<i class="fas fa-times-circle"></i> Unavailable';
                button.classList.add('unavailable');
                button.classList.remove('available');
            }
        }

    } catch (err) {
        // Log the error so you can see the cause in the browser console
        console.error("Frontend Rendering Error:", err); 
    }
});