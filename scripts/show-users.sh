#!/bin/bash

# Script to show users table directly from SQLite database
# This demonstrates that PII data is stored encrypted

DB_PATH="${DB_PATH:-server/data.db}"

if [ ! -f "$DB_PATH" ]; then
    echo "Database not found at $DB_PATH"
    echo "Run 'npm run seed' first to create the database."
    exit 1
fi

echo "=========================================="
echo "Users Table (Raw Database View)"
echo "=========================================="
echo ""
echo "Note: The name, surname, birthdate, and email fields"
echo "contain encrypted data (base64 encoded ciphertext)."
echo ""

sqlite3 -header -column "$DB_PATH" "SELECT id, username, name, surname, birthdate, email, is_active FROM users;"

echo ""
echo "=========================================="
echo "Key Management Table"
echo "=========================================="
echo ""

sqlite3 -header -column "$DB_PATH" "
SELECT km.id, km.user_id, u.username, r.name as role,
       substr(km.public_key, 1, 30) || '...' as public_key_preview,
       substr(km.wrapped_data_key, 1, 30) || '...' as wrapped_key_preview
FROM key_management km
JOIN users u ON km.user_id = u.id
JOIN roles r ON km.role_id = r.id;
"

echo ""
echo "=========================================="
echo "Data Table (Encrypted Values)"
echo "=========================================="
echo ""

sqlite3 -header -column "$DB_PATH" "SELECT id, key, substr(value, 1, 50) || '...' as value_preview, created_at FROM data;"
