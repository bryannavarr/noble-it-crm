#!/bin/bash

# truncate-test-data.sh
# Clears all billable/ticket data from noble_msp for testing
# Preserves: clients, client_rates, client_ticket_sequences, api_keys

set -e

DB_NAME="noble_msp"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"

# Build mysql command
if [ -n "$DB_PASS" ]; then
  MYSQL="mysql -u $DB_USER -p$DB_PASS $DB_NAME"
else
  MYSQL="mysql -u $DB_USER $DB_NAME"
fi

echo "────────────────────────────────────────"
echo "  noble_msp — truncate test data"
echo "────────────────────────────────────────"
echo "  DB user : $DB_USER"
echo "  DB name : $DB_NAME"
echo ""
read -p "  This will delete all tickets, work logs, meetings, invoices, and comments. Continue? (y/N): " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "  Aborted."
  exit 0
fi

echo ""
echo "  Truncating..."

$MYSQL << 'SQL'
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE invoice_line_items;
TRUNCATE TABLE invoices;
TRUNCATE TABLE comments;
TRUNCATE TABLE work_logs;
TRUNCATE TABLE tickets;
TRUNCATE TABLE meetings;

SET FOREIGN_KEY_CHECKS = 1;
SQL

echo "  ✓ invoice_line_items cleared"
echo "  ✓ invoices cleared"
echo "  ✓ comments cleared"
echo "  ✓ work_logs cleared"
echo "  ✓ tickets cleared"
echo "  ✓ meetings cleared"
echo ""

# Reset ticket sequences back to 106 for UNIK
$MYSQL << 'SQL'
UPDATE client_ticket_sequences
SET last_number = 106
WHERE client_id = (SELECT id FROM clients WHERE invoice_prefix = 'UNIK');

UPDATE clients
SET last_invoice_number = 25
WHERE invoice_prefix = 'UNIK';
SQL

echo "  ✓ UNIK ticket sequence reset to 106 (next: UNIK-107)"
echo "  ✓ UNIK invoice sequence reset to 25 (next: UNIK-26)"
echo ""
echo "  Preserved: clients, client_rates, api_keys"
echo "────────────────────────────────────────"
echo "  Done."
echo ""
