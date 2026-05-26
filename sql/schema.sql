CREATE DATABASE IF NOT EXISTS noble_msp;
USE noble_msp;

CREATE TABLE IF NOT EXISTS clients (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(255) NOT NULL,
  contact_name        VARCHAR(255),
  email               VARCHAR(255) NOT NULL,
  phone               VARCHAR(50),
  invoice_prefix      VARCHAR(20) NOT NULL UNIQUE,
  default_rate        DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  last_invoice_number INT NOT NULL DEFAULT 0,
  address             TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Per-client per-category rate overrides
-- If no row exists for a client+category, falls back to client.default_rate
CREATE TABLE IF NOT EXISTS client_rates (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  client_id   INT NOT NULL,
  category    ENUM(
                'BUG',
                'MAINTENANCE',
                'CLOUD_MAINTENANCE',
                'DATABASE',
                'DEPLOYMENT_STAGING',
                'DEPLOYMENT_PROD',
                'FEATURE',
                'HARDWARE',
                'MEETING',
                'BREAK_FIX'
              ) NOT NULL,
  rate        DECIMAL(10,2) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_client_category (client_id, category),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS client_ticket_sequences (
  client_id   INT NOT NULL PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  client_id     INT NOT NULL,
  subject       VARCHAR(500) NOT NULL,
  description   TEXT,
  category      ENUM(
                  'BUG',
                  'MAINTENANCE',
                  'CLOUD_MAINTENANCE',
                  'DATABASE',
                  'DEPLOYMENT_STAGING',
                  'DEPLOYMENT_PROD',
                  'FEATURE',
                  'HARDWARE',
                  'BREAK_FIX'
                ) NOT NULL,
  priority      ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL DEFAULT 'MEDIUM',
  status        ENUM(
                  'TODO',
                  'BACKLOG',
                  'IN_PROGRESS',
                  'DONE',
                  'CANCELLED',
                  'INVALID'
                ) NOT NULL DEFAULT 'IN_PROGRESS',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS work_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id   INT NOT NULL,
  client_id   INT NOT NULL,
  qty         DECIMAL(8,2) NOT NULL,          -- hours for services, quantity for hardware
  unit_price  DECIMAL(10,2) DEFAULT NULL,     -- set for hardware, null for services (uses client rate)
  description TEXT,
  worked_date DATE NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS comments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id   INT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS meetings (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  client_id    INT NOT NULL,
  description  VARCHAR(500) NOT NULL,
  meeting_date DATE NOT NULL,
  start_time   VARCHAR(20),
  end_time     VARCHAR(20),
  hours        DECIMAL(5,2) NOT NULL,
  invoice_id   INT DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  client_id      INT NOT NULL,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  invoice_date   DATE NOT NULL,
  due_date       DATE NOT NULL,
  total_hours    DECIMAL(8,2) NOT NULL DEFAULT 0,
  total_amount   DECIMAL(10,2) NOT NULL DEFAULT 0,
  status         ENUM('DRAFT','PENDING_APPROVAL','APPROVED','SENT','PAID') DEFAULT 'DRAFT',
  pdf_path       VARCHAR(500),
  sent_at        TIMESTAMP NULL,
  paid_at        TIMESTAMP NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id   INT NOT NULL,
  type         ENUM('TICKET','MEETING') NOT NULL,
  reference_id INT NOT NULL,
  category     VARCHAR(100),
  subject      VARCHAR(500) NOT NULL,
  hours        DECIMAL(5,2) NOT NULL,
  rate         DECIMAL(10,2) NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  api_key      VARCHAR(255) NOT NULL UNIQUE,
  is_active    BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMP NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Seeds ─────────────────────────────────────────────────────────────────────

INSERT INTO clients (name, contact_name, email, phone, invoice_prefix, default_rate, last_invoice_number)
VALUES ('Unik Orthopedics', 'Charlie Chi', 'charlie@bwurxs.com', '408-887-5842', 'UNIK', 50.00, 25)
ON DUPLICATE KEY UPDATE name = name;

INSERT INTO client_ticket_sequences (client_id, last_number)
SELECT id, 106 FROM clients WHERE invoice_prefix = 'UNIK'
ON DUPLICATE KEY UPDATE last_number = last_number;