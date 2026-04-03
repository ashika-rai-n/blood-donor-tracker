-- Create the database
CREATE DATABASE IF NOT EXISTS blood_donor_db;

-- Use the newly created database
USE blood_donor_db;

-- Create the Donors table
CREATE TABLE donors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL, -- Store the hashed password
    age INT NOT NULL,
    blood_group VARCHAR(5) NOT NULL,
    phone VARCHAR(30) DEFAULT '',
    district VARCHAR(100) DEFAULT '',
    state VARCHAR(100) DEFAULT '',
    city VARCHAR(100) NOT NULL,
    area VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    last_donation DATE DEFAULT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    registration_type VARCHAR(20) DEFAULT 'donor',
    -- Store the Web Push Subscription as JSON
    subscription JSON, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index the columns used for nearest-location searching (city, pincode)
CREATE INDEX idx_location ON donors (city, pincode);

-- Index the blood_group for faster filtering
CREATE INDEX idx_blood_group ON donors (blood_group);

-- Donations history table to track individual donations per donor
CREATE TABLE IF NOT EXISTS donations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    donor_id INT NOT NULL,
    donation_date DATE NOT NULL,
    location VARCHAR(255) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE CASCADE
);