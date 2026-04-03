// Load environment variables

require('dotenv').config();
const express = require('express');
const path = require('path');
// Note: using the '/promise' version of mysql2, which is required for async/await
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const twilio = require('twilio');
// const cors = require('cors'); // REMOVED: Per your request

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Setup
app.use(express.json());
// Parse URL-encoded bodies (Twilio sends incoming SMS as application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: false }));
// app.use(cors()); // REMOVED: Per your request
// Tell Express to serve static files from the current directory
app.use(express.static(path.join(__dirname)));


// --- Database Connection Pool ---
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection on startup
dbPool.getConnection()
    .then(connection => {
        console.log('✅ MySQL connected successfully.');
        connection.release();
    })
    .catch(err => {
        console.error('❌ MySQL connection error:', err.message);
        process.exit(1);
    });


// --- Push Notification Setup ---
// Twilio client (used to send SMS)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM; // e.g., +1234567890
let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('✅ Twilio client initialized.');
} else {
    console.warn('⚠️ Twilio credentials not found in environment. SMS sending will be disabled.');
}


// ----------------------------------------------------------------
// --- API Endpoints ---
// ----------------------------------------------------------------

// Helper: attempt to find a donor by matching last digits of phone numbers
async function findDonorByPhone(phone) {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    const last10 = digits.slice(-10);
    try {
        const sql = `SELECT id, name, phone FROM donors WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE CONCAT('%', ?) LIMIT 1`;
        const [rows] = await dbPool.query(sql, [last10]);
        return rows && rows.length ? rows[0] : null;
    } catch (err) {
        console.error('Error finding donor by phone:', err && err.message ? err.message : err);
        return null;
    }
}

// Helper: save inbound/outbound message to messages table (if exists)
async function saveMessageRecord({ donorId = null, fromNumber, toNumber, body, direction = 'inbound', twilioSid = null }) {
    try {
        const sql = `INSERT INTO messages (donor_id, from_number, to_number, body, direction, twilio_sid) VALUES (?, ?, ?, ?, ?, ?)`;
        await dbPool.query(sql, [donorId, fromNumber || '', toNumber || '', body || '', direction, twilioSid]);
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            console.warn('messages table not found; inbound message not saved.');
            return;
        }
        console.error('Failed to save message record:', err && err.message ? err.message : err);
    }
}


// 1. REGISTRATION ROUTE (POST: /api/register)
app.post('/api/register', async (req, res) => {
    try {
        console.time('register-endpoint');
        const { name, email, password, age, bloodGroup, city, area, pincode, phone, district, state, lastDonation, registrationType } = req.body;

        console.time('hash-password');
        const hashedPassword = await bcrypt.hash(password, 10);
        console.timeEnd('hash-password');

        const sql = `
            INSERT INTO donors (name, email, password, age, blood_group, phone, district, state, city, area, pincode, last_donation, registration_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [name, email, hashedPassword, age, bloodGroup, phone || '', district || '', state || '', city, area, pincode, lastDonation || null, registrationType || 'donor'];

        const [insertResult] = await dbPool.query(sql, values);

        console.log('Registration: inserted donor id', insertResult && insertResult.insertId);

        // After registration, set availability automatically based on lastDonation and registrationType
        try {
            const donorId = insertResult.insertId;
            let makeAvailable = 0;
            if (!lastDonation && (!registrationType || registrationType === 'donor' || registrationType === 'both')) {
                // No last donation recorded -> available
                makeAvailable = 1;
            } else if (lastDonation) {
                const donatedAt = new Date(lastDonation);
                const now = new Date();
                const diffDays = Math.floor((now - donatedAt) / (1000 * 60 * 60 * 24));
                makeAvailable = (diffDays >= 90) ? 1 : 0;
            }
            await dbPool.query('UPDATE donors SET is_available = ? WHERE id = ?', [makeAvailable, donorId]);
        } catch (err) {
            console.warn('Could not auto-set availability on registration:', err && err.message ? err.message : err);
        }

        res.status(201).json({ message: 'Donor registered successfully!' });

        console.timeEnd('register-endpoint');

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') { 
            return res.status(400).json({ message: 'Email already registered.' });
        }
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration.', error: error.message });
    }
});


// 2. LOGIN ROUTE (POST: /api/login)
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Please provide both email and password.' });
    }

    try {
        // 1. Find the donor by email
        const sql = 'SELECT id, name, password FROM donors WHERE email = ?';
        const [rows] = await dbPool.query(sql, [email]);
        const donor = rows[0];

        if (!donor) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        // 2. Compare the provided password with the hashed password
        const isMatch = await bcrypt.compare(password, donor.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        // 3. Success: Send back necessary donor info
        res.json({ 
            message: 'Login successful!', 
            name: donor.name, 
            donorId: donor.id 
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.', error: error.message });
    }
});


// 3. DONOR PROFILE ROUTE (GET: /api/donor/:donorId) 
// This is the FIX for the "Error loading donor details"
app.get('/api/donor/:donorId', async (req, res) => {
    const donorId = req.params.donorId;
    
    // Select all fields needed for the profile page
    // IMPORTANT: Assuming 'id' is the primary key column name in your 'donors' table.
    const sql = "SELECT name, email, age, blood_group, phone, district, state, city, area, pincode, is_available, last_donation, registration_type FROM donors WHERE id = ?"; 

    try {
        // Use the correctly named database connection variable: dbPool
        const [rows] = await dbPool.query(sql, [donorId]); 
        
        if (rows.length === 0) {
            return res.status(404).json({ message: "Donor not found" });
        }

        // Success! Send the donor's data back to the browser
        res.json(rows[0]); 

    } catch (error) {
        console.error("Database error fetching donor details:", error);
        // This catch block handles SQL errors, returning the 500 status code
        res.status(500).json({ message: "Internal server error." });
    }
});


// 5. PUSH NOTIFICATION SUBSCRIPTION ROUTE (POST: /api/subscribe/:donorId)
//    Repurposed to save donor phone numbers for SMS via Twilio
//
// POST /api/subscribe/:donorId  { phone: "+91..." }
//
// Note: This endpoint previously handled Web Push subscriptions. We now store a phone number
// and (optionally) send a confirmation SMS using Twilio.
//
// 5. PUSH NOTIFICATION SUBSCRIPTION ROUTE (POST: /api/subscribe/:donorId)
//    (see implementation below)
//
app.post('/api/subscribe/:donorId', async (req, res) => {
    // Repurposed: accept { phone } to store/update donor's phone number for SMS notifications
    const donorId = req.params.donorId;
    const { phone } = req.body || {};

    if (!phone) {
        return res.status(400).json({ message: 'Phone number is required in the request body as { phone: "+919XXXXXXXXX" }' });
    }

    try {
        const sql = `UPDATE donors SET phone = ? WHERE id = ?`;
        const [result] = await dbPool.query(sql, [phone, donorId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Donor not found.' });
        }

        // Send a test SMS to confirm subscription (if Twilio configured)
        if (twilioClient && TWILIO_FROM) {
            const msg = `You are now subscribed to urgent blood request alerts from Blood Donor Tracker.`;
            twilioClient.messages.create({ body: msg, from: TWILIO_FROM, to: phone })
                .then(m => console.log('Test SMS sent, sid:', m.sid))
                .catch(err => console.error('Test SMS failed:', err));
        } else {
            console.warn('Twilio not configured: skipping test SMS.');
        }

        res.status(201).json({ message: 'Phone saved for SMS notifications.' });
    } catch (error) {
        console.error('Subscription/phone save error:', error);
        res.status(500).json({ message: 'Failed to save phone number.', error: error.message });
    }
});


// Update last donation date

// 6. BLOOD REQUEST ROUTE (POST: /api/request-blood) - CORE PRIORITY LOGIC
app.post('/api/request-blood', async (req, res) => {
    const { requesterBloodGroup, requesterCity, requesterPincode, requesterName } = req.body;

    if (!requesterBloodGroup || !requesterCity || !requesterPincode) {
        return res.status(400).json({ message: 'Missing request details.' });
    }

    try {
        let sql, values;
        
        // --- PROXIMITY-BASED PRIORITY QUERY ---
        
        // Priority 1: Exact Pincode Match (Nearest)
        sql = `
            SELECT id, email, phone FROM donors 
            WHERE blood_group = ? AND is_available = TRUE AND pincode = ?
            LIMIT 10
        `;
        values = [requesterBloodGroup, requesterPincode];
        let [nearestDonors] = await dbPool.query(sql, values);

        // Priority 2: City Match (If no Pincode matches found)
        if (nearestDonors.length === 0) {
            sql = `
                SELECT id, email, phone FROM donors 
                WHERE blood_group = ? AND is_available = TRUE AND city = ?
                LIMIT 10
            `;
            values = [requesterBloodGroup, requesterCity];
            [nearestDonors] = await dbPool.query(sql, values);
        }
        
        // --- SEND NOTIFICATIONS ---
        // Send SMS to nearest donors using Twilio if phone is present
        const smsPromises = nearestDonors
            .filter(donor => donor.phone)
            .map(async (donor) => {
                if (!twilioClient || !TWILIO_FROM) {
                    console.warn('Twilio not configured - skipping SMS to', donor.phone);
                    return { skipped: true };
                }
                const body = `🔴 URGENT: ${requesterBloodGroup} blood needed near you in ${requesterCity}. Please respond if you can donate.`;
                try {
                    const m = await twilioClient.messages.create({ body, from: TWILIO_FROM, to: donor.phone });
                    // persist outbound message
                    try {
                        await saveMessageRecord({ donorId: donor.id, fromNumber: TWILIO_FROM || '', toNumber: donor.phone, body, direction: 'outbound', twilioSid: m.sid });
                    } catch (e) {
                        console.warn('Failed to persist outbound message for donor', donor.id, e && e.message ? e.message : e);
                    }
                    return { sid: m.sid };
                } catch (err) {
                    console.error(`SMS failed for donor ${donor.email || donor.phone}:`, err && err.message ? err.message : err);
                    return { error: err };
                }
            });

        const results = await Promise.allSettled(smsPromises);
        const notifiedCount = results.filter(r => r.status === 'fulfilled' && r.value && !r.value.skipped).length;

        res.status(200).json({ 
            message: `Blood request initiated. ${notifiedCount} nearest potential donors notified (via SMS).`,
            notifiedDonorsCount: notifiedCount
        });

    } catch (error) {
        console.error('Blood request error:', error);
        res.status(500).json({ message: 'Server error during blood request processing.', error: error.message });
    }
});

    // 8. SEARCH DONORS (POST: /api/donors/search)
    // Expects { bloodGroup, pincode, area, city }
    app.post('/api/donors/search', async (req, res) => {
        // Debug: log incoming search requests
        console.log('POST /api/donors/search called with body:', req.body);
        const { bloodGroup, pincode, area, city, excludeDonorId } = req.body;

        if (!bloodGroup) return res.status(400).json({ message: 'bloodGroup is required' });

        // Helper: return donor blood groups compatible with a recipient blood group (RBC compatibility)
        function compatibleDonorGroupsFor(recipient) {
            // Normalize input
            const r = String(recipient || '').toUpperCase().replace(//g, '');
            const map = {
                'O-': ['O-'],
                'O+': ['O+', 'O-'],
                'A-': ['A-', 'O-'],
                'A+': ['A+', 'A-', 'O+', 'O-'],
                'B-': ['B-', 'O-'],
                'B+': ['B+', 'B-', 'O+', 'O-'],
                'AB-': ['AB-', 'A-', 'B-', 'O-'],
                'AB+': ['AB+','AB-','A+','A-','B+','B-','O+','O-']
            };
            return map[r] || [recipient];
        }

        try {
            // Build WHERE clauses: must be a compatible blood group, available, and a donor (not a pure recipient)
            const compat = compatibleDonorGroupsFor(bloodGroup);
            const placeholders = compat.map(_ => '?').join(',');
            const where = [`blood_group IN (${placeholders})`, 'is_available = TRUE', "(registration_type IS NULL OR registration_type IN ('donor','both'))"];
            const params = [...compat];

            if (pincode) {
                where.push('pincode = ?');
                params.push(pincode);
            }
            if (city) {
                where.push('city LIKE ?');
                params.push('%' + city + '%');
            }
            if (area) {
                where.push('area LIKE ?');
                params.push('%' + area + '%');
            }

            // Optionally exclude the current user's donor record from results
            if (excludeDonorId) {
                // only add numeric values to avoid SQL injection via strings
                const idNum = parseInt(String(excludeDonorId), 10);
                if (!Number.isNaN(idNum)) {
                    where.push('id != ?');
                    params.push(idNum);
                }
            }

            const sql = `SELECT id, name, blood_group, phone, email, area, city, pincode, last_donation FROM donors WHERE ${where.join(' AND ')} LIMIT 200`;
            let [rows] = await dbPool.query(sql, params);

            // If no rows found and both city & area provided, try swapping them in case user entered order differently
            if ((!rows || rows.length === 0) && city && area) {
                console.log('No rows found — trying fallback by swapping city and area');
                const where2 = ['blood_group = ?', 'is_available = TRUE', "(registration_type IS NULL OR registration_type IN ('donor','both'))"];
                const params2 = [bloodGroup];
                if (pincode) {
                    where2.push('pincode = ?');
                    params2.push(pincode);
                }
                // swap: use area value for city and city value for area
                where2.push('city LIKE ?');
                params2.push('%' + area + '%');
                where2.push('area LIKE ?');
                params2.push('%' + city + '%');

                const sql2 = `SELECT id, name, blood_group, phone, email, area, city, pincode, last_donation FROM donors WHERE ${where2.join(' AND ')} LIMIT 200`;
                const [rows2] = await dbPool.query(sql2, params2);
                rows = rows2;
            }

            // Rule-based scoring weights (tunable)
            const WEIGHTS = {
                PINCODE: 50,
                CITY: 30,
                AREA: 20
            };

            const now = new Date();
            const donors = rows.map(r => {
                let score = 0;

                if (pincode && r.pincode && pincode === r.pincode) score += WEIGHTS.PINCODE;
                if (city && r.city && r.city.toLowerCase().includes(city.toLowerCase())) score += WEIGHTS.CITY;
                if (area && r.area && r.area.toLowerCase().includes(area.toLowerCase())) score += WEIGHTS.AREA;

                // Prefer exact blood-group matches higher than compatible substitutes
                if (r.blood_group && r.blood_group.toUpperCase() === String(bloodGroup).toUpperCase()) {
                    score += 100; // large bonus for exact match
                }

                // last donation handling: compute days since last donation
                let lastDonationDate = null;
                let last_donation_warning = false;
                let daysSinceLastDonation = null;
                if (r.last_donation) {
                    lastDonationDate = new Date(r.last_donation);
                    const diffDays = Math.floor((now - lastDonationDate) / (1000 * 60 * 60 * 24));
                    daysSinceLastDonation = diffDays;
                    if (diffDays < 90) {
                        last_donation_warning = true;
                        // Penalize recent donors heavily so they appear last
                        score -= 1000;
                    }
                }

                // Eligible flag: true if not donated in last 90 days (or never donated)
                const eligible = (daysSinceLastDonation === null) || (daysSinceLastDonation >= 90);

                return {
                    id: r.id,
                    name: r.name,
                    blood_group: r.blood_group,
                    phone: r.phone,
                    email: r.email,
                    area: r.area,
                    city: r.city,
                    pincode: r.pincode,
                    last_donation: r.last_donation,
                    days_since_last_donation: daysSinceLastDonation,
                    eligible,
                    match_score: Math.max(0, score),
                    last_donation_warning
                };
            });

            // Sort: eligible donors first by match_score desc, then prefer those who donated longer ago
            donors.sort((a, b) => {
                if ((a.eligible === true) !== (b.eligible === true)) return (a.eligible === true) ? -1 : 1;
                if ((b.match_score || 0) - (a.match_score || 0) !== 0) return (b.match_score || 0) - (a.match_score || 0);
                const aDate = a.last_donation ? new Date(a.last_donation).getTime() : 0;
                const bDate = b.last_donation ? new Date(b.last_donation).getTime() : 0;
                return aDate - bDate;
            });

            res.json(donors);
        } catch (error) {
            console.error('Search donors error:', error);
            res.status(500).json({ message: 'Failed to search donors', error: error.message });
        }
    });


// Update donor availability
app.put('/api/donor/:donorId/availability', async (req, res) => {
    const donorId = req.params.donorId;
    const { isAvailable } = req.body;

    try {
        // If attempting to mark available=true, enforce 90-day deferral based on last_donation
        if (isAvailable) {
            const [rows] = await dbPool.query('SELECT last_donation FROM donors WHERE id = ?', [donorId]);
            if (!rows || rows.length === 0) return res.status(404).json({ message: 'Donor not found' });
            const last = rows[0].last_donation;
            if (last) {
                const donatedAt = new Date(last);
                const now = new Date();
                const diffDays = Math.floor((now - donatedAt) / (1000 * 60 * 60 * 24));
                if (diffDays < 90) {
                    return res.status(400).json({ message: `Donor donated ${diffDays} days ago and cannot be marked available until ${90 - diffDays} more days.` });
                }
            }
        }

        const sql = 'UPDATE donors SET is_available = ? WHERE id = ?';
        const [result] = await dbPool.query(sql, [isAvailable, donorId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Donor not found' });
        }

        res.json({ message: 'Availability updated successfully' });
    } catch (error) {
        console.error('Error updating availability:', error);
        res.status(500).json({ message: 'Server error while updating availability' });
    }
});

// Update last donation date
app.put('/api/donor/:donorId/last-donation', async (req, res) => {
    const donorId = req.params.donorId;
    const { lastDonation } = req.body;

    try {
        const sql = 'UPDATE donors SET last_donation = ? WHERE id = ?';
        const [result] = await dbPool.query(sql, [lastDonation, donorId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Donor not found' });
        }

        // Automatically adjust availability based on last donation date
        if (lastDonation) {
            const donatedAt = new Date(lastDonation);
            const now = new Date();
            const diffDays = Math.floor((now - donatedAt) / (1000 * 60 * 60 * 24));
            const makeAvailable = (diffDays >= 90);
            const availSql = 'UPDATE donors SET is_available = ? WHERE id = ?';
            await dbPool.query(availSql, [makeAvailable ? 1 : 0, donorId]);
        }

        res.json({ message: 'Last donation date updated successfully' });
    } catch (error) {
        console.error('Error updating last donation date:', error);
        res.status(500).json({ message: 'Server error while updating last donation date' });
    }
});

// Update donor profile
app.put('/api/donor/:donorId', async (req, res) => {
    const donorId = req.params.donorId;
    const updates = req.body;

    // List of fields that can be updated
    const allowedFields = ['name', 'age', 'blood_group', 'phone', 'district', 'state', 'city', 'area', 'pincode', 'registration_type'];
    
    try {
        // Filter out any fields that aren't in allowedFields
        const validUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                validUpdates[key] = value;
            }
        }

        if (Object.keys(validUpdates).length === 0) {
            return res.status(400).json({ message: 'No valid fields to update' });
        }

        // Build the SQL query dynamically
        const sql = `UPDATE donors SET ${
            Object.keys(validUpdates)
                .map(key => `${key} = ?`)
                .join(', ')
        } WHERE id = ?`;

        const values = [...Object.values(validUpdates), donorId];
        const [result] = await dbPool.query(sql, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Donor not found' });
        }

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Server error while updating profile' });
    }
});

// Upload profile picture
app.post('/api/donor/:donorId/profile-picture', async (req, res) => {
    const donorId = req.params.donorId;

    // Note: You'll need to set up multer or another middleware to handle file uploads
    // This is a placeholder that assumes the image is saved and returns a URL
    // In a real implementation, you would:
    // 1. Use multer to handle the file upload
    // 2. Save the file to disk or cloud storage
    // 3. Save the file path/URL in the database
    // 4. Return the URL to the client

    res.json({ 
        message: 'Profile picture uploaded successfully',
        imageUrl: '/uploads/profile-pictures/' + donorId + '.jpg'
    });
});

// 7. START THE SERVER
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Donations: list donation history for a donor
app.get('/api/donor/:donorId/donations', async (req, res) => {
    const donorId = req.params.donorId;
    try {
        const sql = `SELECT donation_date as date, location FROM donations WHERE donor_id = ? ORDER BY donation_date DESC`;
        const [rows] = await dbPool.query(sql, [donorId]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching donation history:', error);
        res.status(500).json({ message: 'Failed to fetch donation history' });
    }
});

// Add a donation record for a donor
app.post('/api/donor/:donorId/donations', async (req, res) => {
    const donorId = req.params.donorId;
    const { donationDate, location } = req.body;

    if (!donationDate) {
        return res.status(400).json({ message: 'Donation date is required' });
    }

    try {
        const sql = `INSERT INTO donations (donor_id, donation_date, location) VALUES (?, ?, ?)`;
        const [result] = await dbPool.query(sql, [donorId, donationDate, location || '']);

        // Update donor's last_donation if this date is more recent
        const updateSql = `UPDATE donors SET last_donation = GREATEST(IFNULL(last_donation,'0000-00-00'), ?) WHERE id = ?`;
        await dbPool.query(updateSql, [donationDate, donorId]);

        // After a donation record is added, automatically mark donor as unavailable
        // for the standard deferral period (90 days)
        try {
            const donatedAt = new Date(donationDate);
            const now = new Date();
            const diffDays = Math.floor((now - donatedAt) / (1000 * 60 * 60 * 24));
            const makeAvailable = (diffDays >= 90);
            const availSql = 'UPDATE donors SET is_available = ? WHERE id = ?';
            await dbPool.query(availSql, [makeAvailable ? 1 : 0, donorId]);
        } catch (err) {
            console.error('Error updating availability after donation:', err);
        }

        res.status(201).json({ message: 'Donation record added', donationId: result.insertId });
    } catch (error) {
        console.error('Error adding donation record:', error);
        res.status(500).json({ message: 'Failed to add donation record' });
    }
});

// --- DONORS LISTING ENDPOINT ---
// GET /api/donors?type=all|donor|recipient|both&bloodGroup=&city=&isAvailable=true
app.get('/api/donors', async (req, res) => {
    try {
        const { type, bloodGroup, city, isAvailable } = req.query;
        const where = [];
        const params = [];

        // Registration type filter
        if (type && type !== 'all') {
            if (type === 'donor') {
                where.push("(registration_type IS NULL OR registration_type IN ('donor','both'))");
            } else if (type === 'recipient') {
                where.push('registration_type = ?');
                params.push('recipient');
            } else if (type === 'both') {
                where.push('registration_type = ?');
                params.push('both');
            }
        }

        if (bloodGroup && bloodGroup !== 'all') {
            where.push('blood_group = ?');
            params.push(bloodGroup);
        }

        if (city && city !== 'all') {
            where.push('city = ?');
            params.push(city);
        }

        if (typeof isAvailable !== 'undefined') {
            // Accept 'true' or 'false'
            const val = (String(isAvailable) === 'true') ? 1 : 0;
            where.push('is_available = ?');
            params.push(val);
        }

        const whereClause = where.length ? ('WHERE ' + where.join(' AND ')) : '';
        const sql = `SELECT id, name, blood_group, phone, area, city, pincode, is_available, registration_type, last_donation,
            (is_available = 1 AND (last_donation IS NULL OR DATEDIFF(CURDATE(), last_donation) >= 90)) AS is_effectively_available
            FROM donors ${whereClause} ORDER BY name LIMIT 1000`;
        const [rows] = await dbPool.query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching donors list:', error);
        res.status(500).json({ message: 'Failed to fetch donors', error: error.message });
    }
});

// --- DONORS SUMMARY ---
// Returns counts used by the availability dashboard
app.get('/api/donors/summary', async (req, res) => {
    try {
        const [totalRows] = await dbPool.query('SELECT COUNT(*) as total FROM donors');
        const total = totalRows[0].total || 0;

    const [donorAvailRows] = await dbPool.query("SELECT COUNT(*) as cnt FROM donors WHERE is_available = TRUE AND (last_donation IS NULL OR DATEDIFF(CURDATE(), last_donation) >= 90) AND (registration_type IS NULL OR registration_type IN ('donor','both'))");
        const donorsAvailable = donorAvailRows[0].cnt || 0;

        const [recipientRows] = await dbPool.query("SELECT COUNT(*) as cnt FROM donors WHERE registration_type = 'recipient'");
        const recipients = recipientRows[0].cnt || 0;

        const [bothRows] = await dbPool.query("SELECT COUNT(*) as cnt FROM donors WHERE registration_type = 'both'");
        const both = bothRows[0].cnt || 0;

        res.json({ total, donorsAvailable, recipients, both });
    } catch (error) {
        console.error('Error fetching donors summary:', error);
        res.status(500).json({ message: 'Failed to fetch summary', error: error.message });
    }
});

// Notify a single donor by id with an urgent request SMS
app.post('/api/notify/:donorId', async (req, res) => {
    const donorId = req.params.donorId;
    const { requesterName, requesterBloodGroup, requesterCity, requesterPincode, message, requesterPhone } = req.body || {};

    try {
        const [rows] = await dbPool.query('SELECT phone, name FROM donors WHERE id = ?', [donorId]);
        if (!rows || rows.length === 0) return res.status(404).json({ message: 'Donor not found' });
        const donor = rows[0];
        if (!donor.phone) return res.status(400).json({ message: 'Donor has no phone number on record' });

        if (!twilioClient || !TWILIO_FROM) {
            return res.status(503).json({ message: 'SMS service not configured on server' });
        }

        // Include requester phone in the message so donors can contact the requester directly
        const contactInfo = requesterPhone ? `${requesterName || 'Requester'} ${requesterPhone}` : (requesterName || 'Requester');
        const bodyText = message || `🔴 URGENT: ${requesterBloodGroup} blood needed near ${requesterCity}. Please respond if you can donate. Contact: ${contactInfo}`;
        const sent = await twilioClient.messages.create({ body: bodyText, from: TWILIO_FROM, to: donor.phone });
        // persist outbound message if messages table exists
        try {
            await saveMessageRecord({ donorId, fromNumber: TWILIO_FROM || '', toNumber: donor.phone, body: bodyText, direction: 'outbound', twilioSid: sent && sent.sid ? sent.sid : null });
        } catch (e) {
            console.warn('Failed to persist outbound message:', e && e.message ? e.message : e);
        }
        res.json({ message: 'Notification sent', sid: sent.sid, donorPhone: donor.phone || null });
    } catch (error) {
        console.error('Error notifying donor:', error);
        res.status(500).json({ message: 'Failed to notify donor', error: error.message });
    }
});

// Messages listing for notification panel (safe fallback if messages table doesn't exist)
app.get('/api/messages', async (req, res) => {
    try {
        const sql = `SELECT m.id, m.from_number AS fromNumber, m.to_number AS toNumber, m.body, m.direction, m.twilio_sid AS twilioSid, m.created_at AS createdAt, d.id AS donorId, d.name AS donorName
                     FROM messages m
                     LEFT JOIN donors d ON d.id = m.donor_id
                     ORDER BY m.created_at DESC
                     LIMIT 200`;
        const [rows] = await dbPool.query(sql);
        res.json(rows);
    } catch (err) {
        // If the messages table was not created, return an empty array instead of a 500
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            console.warn('messages table not found; returning empty message list.');
            return res.json([]);
        }
        console.error('Error fetching messages:', err && err.message ? err.message : err);
        res.status(500).json({ message: 'Failed to fetch messages.', error: err.message });
    }
});


// Twilio inbound webhook: receive incoming SMS and store as messages
app.post('/twilio/inbound', async (req, res) => {
    // Twilio posts form-encoded body: From, To, Body, MessageSid, etc.
    const from = req.body.From || req.body.from || '';
    const to = req.body.To || req.body.to || '';
    const body = req.body.Body || req.body.body || '';
    const messageSid = req.body.MessageSid || req.body.messageSid || null;

    try {
        const donor = await findDonorByPhone(from);
        const donorId = donor ? donor.id : null;

        await saveMessageRecord({ donorId, fromNumber: from, toNumber: to, body, direction: 'inbound', twilioSid: messageSid });

        console.log('Received inbound SMS from', from, 'matched donor:', donor ? donor.id : 'none');

        // Respond with empty TwiML to acknowledge receipt
        res.set('Content-Type', 'text/xml');
        res.send('<Response></Response>');
    } catch (err) {
        console.error('Error handling inbound Twilio SMS:', err && err.message ? err.message : err);
        res.status(500).send('');
    }
});