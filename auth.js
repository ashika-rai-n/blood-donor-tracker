document.addEventListener('DOMContentLoaded', () => {
    // --- Login Logic ---
    const loginForm = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register'); // Get the Register form

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // --- Registration Logic ---
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    async function handleLogin(event) {
        event.preventDefault();
        
        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');
        const submitButton = loginForm.querySelector('.auth-submit-btn');

        if (submitButton) {
            submitButton.textContent = 'Logging in...';
            submitButton.disabled = true;
        }

        const email = emailInput.value;
        const password = passwordInput.value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (response.ok) {
                alert(`Welcome back, ${data.name}! You are logged in.`);
                localStorage.setItem('donorId', data.donorId);
                localStorage.setItem('donorName', data.name);
                window.location.href = 'dashboard.html';
            } else {
                alert(`Login Failed: ${data.message}`);
            }

        } catch (error) {
            console.error('Network or Login processing error:', error);
            alert('🛑 Network Error: Could not connect to the server for login.');
        } finally {
            if (submitButton) {
                submitButton.textContent = 'Login';
                submitButton.disabled = false;
            }
        }
    }


    // ************************************************************
    // *** NEW FUNCTION: Registration Handler (FIXES MISSING DATA) ***
    // ************************************************************
    async function handleRegister(event) {
        event.preventDefault();
        
        const submitButton = registerForm.querySelector('.auth-submit-btn');
        if (submitButton) {
            submitButton.textContent = 'Registering...';
            submitButton.disabled = true;
        }

        // 1. COLLECT ALL DATA (MUST BE ACCURATE)
        const name = document.getElementById('reg-name').value;
        const age = document.getElementById('reg-age').value;
        const bloodGroup = document.getElementById('reg-blood').value; // FIX: Blood group collected
        const phone = document.getElementById('reg-phone').value;       // FIX: Phone number collected
        
        // Location Details
        const district = document.getElementById('reg-district').value;
        const city = document.getElementById('reg-city').value;
        const area = document.getElementById('reg-area').value;
        const pincode = document.getElementById('reg-pincode').value;
        
        // Credentials
        const email = document.getElementById('reg-username').value; // Assuming you use 'username' as 'email' here
        const password = document.getElementById('reg-password').value;
        // Note: I'm using 'reg-username' as the email field here, assuming that's intended.
        

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    name, 
                    email, 
                    password, 
                    age, 
                    bloodGroup, 
                    phone,      // Sent to backend
                    district, 
                    city, 
                    area, 
                    pincode 
                }),
            });

            const data = await response.json();

            if (response.ok) {
                alert('Registration successful! Please log in with your new account.');
                window.location.href = 'login.html';
            } else {
                alert(`Registration Failed: ${data.message}`);
            }

        } catch (error) {
            console.error('Registration error:', error);
            alert('🛑 Network Error: Could not connect to the server.');
        } finally {
            if (submitButton) {
                submitButton.textContent = 'Register Donor';
                submitButton.disabled = false;
            }
        }
    }
});