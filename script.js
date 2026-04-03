document.addEventListener('DOMContentLoaded', () => {
    // 1. Get the registration form element
    const registerForm = document.getElementById('form-register');
    const registerButton = document.querySelector('#form-register .auth-submit-btn');
    const API_URL = 'http://localhost:3000/api/register'; // Ensure port 3000

    if (registerForm) {
        const originalRegisterText = registerButton ? registerButton.textContent : 'Register';

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // <-- STOPS the browser from reloading

            // Disable button and show loading state
            if (registerButton) {
                registerButton.textContent = 'Registering...';
                registerButton.disabled = true;
            }

            // 2. Collect Data
            const name = document.getElementById('reg-name').value;
            const age = parseInt(document.getElementById('reg-age').value);
            // support either id name (older files used 'reg-blood')
            const bloodGroupEl = document.getElementById('reg-blood') || document.getElementById('reg-blood-group');
            const bloodGroup = bloodGroupEl ? bloodGroupEl.value : '';
            const email = document.getElementById('reg-username').value; 
            const password = document.getElementById('reg-password').value;
            const city = document.getElementById('reg-city').value;
            const area = document.getElementById('reg-area').value;
            const pincode = document.getElementById('reg-pincode').value;
            const phone = document.getElementById('reg-phone').value;
            const district = (document.getElementById('reg-district') && document.getElementById('reg-district').value) || '';
            const state = (document.getElementById('reg-state') && document.getElementById('reg-state').value) || '';
            const lastDonation = (document.getElementById('reg-last-donation') && document.getElementById('reg-last-donation').value) || null;
            const registrationType = (document.querySelector('input[name="registration-type"]:checked') && document.querySelector('input[name="registration-type"]:checked').value) || 'donor';

            // Include phone, district, state, and lastDonation so they are saved and later shown in profile
            const donorData = {
                name, email, password, age, bloodGroup, city, area, pincode, phone, district, state, lastDonation, registrationType
            };

            // 3. Send Data to Backend
            try {
                // Debug: show the payload being sent (open browser console to see)
                console.log('Register payload ->', donorData);
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(donorData)
                });

                const result = await response.json();
                console.log('Register response ->', response.status, result);

                if (response.ok) {
                    // Success Path: show non-blocking feedback and redirect shortly
                    if (registerButton) registerButton.textContent = 'Registered ✓';
                    // Small delay so the user sees the confirmation before redirect
                    setTimeout(() => window.location.href = 'login.html', 900);
                } else {
                    // Error Path: If the server returns an error (e.g., email already used)
                    alert(`❌ Registration Failed: ${result.message || 'Server error'}`);
                }

            } catch (error) {
                // Network Error Path: If the server is down or wrong URL
                alert('🛑 Network Error: Could not connect to the server.');
                console.error('Fetch Error:', error);
            } finally {
                if (registerButton) {
                    registerButton.textContent = originalRegisterText;
                    registerButton.disabled = false;
                }
            }
        });
    }
    // ... other logic (like the login handler) goes here
});





// Profile-loading code: only run on donor-profile pages (guard by checking for elements present there)
document.addEventListener('DOMContentLoaded', async () => {
    // If this page doesn't have donor-profile specific elements, skip
    if (!document.getElementById('donorAddress') && !document.getElementById('toggleAvailabilityBtn')) return;

    // 1. Get donorId from localStorage
    const donorId = localStorage.getItem('donorId');
    if (!donorId) {
        window.location.href = "login.html";
        return;
    }

    // 2. Fetch donor data
    try {
        const res = await fetch(`http://localhost:3000/api/donor/${donorId}`);
        const donor = await res.json();

        // 3. Populate the fields (if present)
        const setIf = (id, value) => {
            const el = document.getElementById(id);
            if (!el) return;
            // Show a clear placeholder when value is missing
            el.textContent = (value === null || value === undefined || value === '') ? 'N/A' : value;
        };

        setIf('reg-name', donor.name || '');
    setIf('reg-age', donor.age || '');
    setIf('reg-blood', donor.blood_group || '');
        setIf('reg-email', donor.email || '');
        setIf('reg-username', donor.email || '');
        setIf('reg-phone', donor.phone || '');
        setIf('reg-district', donor.district || '');
    setIf('reg-state', donor.state || '');
    setIf('reg-registration_type', donor.registration_type || '');
        setIf('reg-city', donor.city || '');
        setIf('reg-area', donor.area || '');
        setIf('reg-pincode', donor.pincode || '');

        const donorAddressEl = document.getElementById('donorAddress');
        if (donorAddressEl) {
            const addr = [donor.city, donor.area, donor.pincode].filter(Boolean).join(', ');
            donorAddressEl.textContent = addr || 'N/A';
        }

        // Show last donation date in the readable display span if present
        const lastDisplay = document.getElementById('reg-last-donation-display');
        if (lastDisplay) {
            lastDisplay.textContent = donor.last_donation ? new Date(donor.last_donation).toLocaleDateString() : 'N/A';
        }

        // Set Availability Button
        const availBtn = document.getElementById('toggleAvailabilityBtn');
        if (availBtn) {
            if (donor.is_available) {
                availBtn.innerHTML = '<i class="fas fa-check-circle"></i> Available';
                availBtn.classList.add('available');
                availBtn.classList.remove('unavailable');
            } else {
                availBtn.innerHTML = '<i class="fas fa-times-circle"></i> Unavailable';
                availBtn.classList.add('unavailable');
                availBtn.classList.remove('available');
            }
        }
        // Set last donation input if present (some pages may have this input)
        const lastDonationInput = document.getElementById('lastDonation') || document.getElementById('reg-last-donation');
        if (lastDonationInput) {
            if (donor.last_donation) {
                const date = new Date(donor.last_donation);
                lastDonationInput.value = date.toISOString().split('T')[0];
            } else if (donor.lastDonation) {
                // support alternate key
                lastDonationInput.value = donor.lastDonation;
            }
        }
    } catch (err) {
        console.error('Error loading donor details:', err);
    }
});

