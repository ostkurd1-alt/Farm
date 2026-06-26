-- Migration: Update database schema for bcrypt passwords and security features
-- Run this script on an existing database to add the new columns

-- Step 1: Alter password column to accommodate bcrypt hashes (60 chars)
ALTER TABLE wof_user MODIFY COLUMN password VARCHAR(60) NOT NULL;

-- Step 2: Extend recovery token length for secure tokens
ALTER TABLE wof_user MODIFY COLUMN recovery VARCHAR(64) NULL DEFAULT NULL;

-- Step 3: Add recovery token expiry column
ALTER TABLE wof_user ADD COLUMN recovery_expires TIMESTAMP NULL DEFAULT NULL;

-- Step 4: Add login attempt tracking columns
ALTER TABLE wof_user ADD COLUMN login_attempts INT(1) DEFAULT 0;
ALTER TABLE wof_user ADD COLUMN locked_until TIMESTAMP NULL DEFAULT NULL;

-- Note: Existing MD5 passwords will need to be re-hashed on next login
-- The server code handles this automatically when a user logs in
