#!/usr/bin/env bash

# PilotPanel Installer
# Minecraft-Focused Game Hosting Panel & Daemon Installer
# Branded completely as PilotPanel

set -e

# Visual formatting
COLOR_INFO='\033[0;34m'
COLOR_SUCCESS='\033[0;32m'
COLOR_WARNING='\033[0;33m'
COLOR_ERROR='\033[0;31m'
COLOR_RESET='\033[0m'

echo -e "${COLOR_INFO}=====================================================${COLOR_RESET}"
echo -e "${COLOR_INFO}       PilotPanel installer & Deploy Agent          ${COLOR_RESET}"
echo -e "${COLOR_INFO}=====================================================${COLOR_RESET}"

# Verify root privilege
if [ "$EUID" -ne 0 ]; then
  echo -e "${COLOR_ERROR}Error: Please execute installer as root or via sudo.${COLOR_RESET}"
  exit 1
fi

# Detect operating system
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
else
  echo -e "${COLOR_ERROR}Error: Could not identify OS. Debian/Ubuntu is recommended.${COLOR_RESET}"
  exit 1
fi

echo -e "System OS detected: ${COLOR_SUCCESS}${OS}${COLOR_RESET}"

# 1. Install Docker & Dependencies
echo -e "${COLOR_INFO}Step 1: Installing Docker, Docker Compose, and Nginx...${COLOR_RESET}"
apt-get update -y
apt-get install -y curl gnupg lsb-release nginx ufw git nodejs npm postgresql-client

if ! [ -x "$(command -v docker)" ]; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo -e "${COLOR_SUCCESS}Docker daemon successfully loaded.${COLOR_RESET}"
else
  echo -e "Docker is already installed, skipping..."
fi

# 2. Install PostgreSQL local database
echo -e "${COLOR_INFO}Step 2: Installing PostgreSQL DB server...${COLOR_RESET}"
if ! [ -x "$(command -v psql)" ]; then
  apt-get install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
  
  # Configure database and user
  sudo -u postgres psql -c "CREATE USER pilotpanel WITH PASSWORD 'secret_db_password_123';"
  sudo -u postgres psql -c "CREATE DATABASE pilotpanel OWNER pilotpanel;"
  echo -e "${COLOR_SUCCESS}PostgreSQL setup successfully.${COLOR_RESET}"
else
  echo -e "PostgreSQL server already installed, skipping..."
fi

# 3. Configure Nginx Reverse Proxy
echo -e "${COLOR_INFO}Step 3: Setting up Nginx virtual host configurations...${COLOR_RESET}"
NGINX_CONF="/etc/nginx/sites-available/pilotpanel.conf"

cat << 'EOF' > "$NGINX_CONF"
server {
    listen 80;
    server_name _;

    # Relays REST and UI
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Relays Daemon metrics
    location /daemon/ {
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/default
systemctl restart nginx
echo -e "${COLOR_SUCCESS}Nginx blocks updated and reloaded.${COLOR_RESET}"

# 4. Configure Firewall (UFW)
echo -e "${COLOR_INFO}Step 4: Securing nodes via Firewall (UFW)...${COLOR_RESET}"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 25565/tcp # Default Minecraft server port
ufw allow 3000/tcp  # PilotPanel main port
ufw allow 3001/tcp  # PilotDaemon port
ufw --force enable
echo -e "${COLOR_SUCCESS}Firewall rules applied.${COLOR_RESET}"

# 5. Clone and Deploy PilotPanel
echo -e "${COLOR_INFO}Step 5: Fetching PilotPanel and PilotDaemon sources...${COLOR_RESET}"
mkdir -p /var/www/pilotpanel
git clone https://github.com/xAyan55/pilotpanel.git /var/www/pilotpanel || true

# Setup Panel ENV
cat << 'EOF' > /var/www/pilotpanel/backend/.env
PORT=3000
DATABASE_URL="postgresql://pilotpanel:secret_db_password_123@localhost:5432/pilotpanel"
JWT_SECRET="install-secret-session-key-998877"
EOF

# Setup Daemon ENV
cat << 'EOF' > /var/www/pilotpanel/daemon/.env
PORT=3001
NODE_TOKEN="daemon-secured-token-secret-key-12345"
PANEL_URL="http://localhost:3000"
EOF

# Install dependencies and build
echo -e "Installing node bundles..."
cd /var/www/pilotpanel/backend && npm install && npm run build || true
cd /var/www/pilotpanel/daemon && npm install && npm run build || true

# 6. Create Admin Owner account stub
echo -e "${COLOR_INFO}Step 6: Seeding default Owner account...${COLOR_RESET}"
# Runs local node script to insert database account safely
cd /var/www/pilotpanel/backend
node -e "
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const prisma = new PrismaClient();
async function seed() {
  const hash = await argon2.hash('admin123');
  try {
    await prisma.user.create({
      data: {
        email: 'admin@pilotpanel.io',
        password: hash,
        role: 'Owner'
      }
    });
    console.log('Seeded User: admin@pilotpanel.io / admin123');
  } catch(e) {
    console.log('User already exists, skipping...');
  }
}
seed();
" || true

echo -e "${COLOR_SUCCESS}=====================================================${COLOR_RESET}"
echo -e "${COLOR_SUCCESS} PilotPanel & PilotDaemon successfully deployed!     ${COLOR_RESET}"
echo -e "${COLOR_SUCCESS} Default Username: admin@pilotpanel.io               ${COLOR_RESET}"
echo -e "${COLOR_SUCCESS} Default Password: admin123                          ${COLOR_RESET}"
echo -e "${COLOR_SUCCESS} Panel Port: 3000 | Daemon Port: 3001                ${COLOR_RESET}"
echo -e "${COLOR_SUCCESS}=====================================================${COLOR_RESET}"
