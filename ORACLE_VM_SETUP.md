# Deploying MoneyGame Side-by-Side with NithConnect on Oracle VM

Your Oracle VM currently has this structure:
```bash
ubuntu@nithconnect-backend-amp:~$ ls
NithConnect  bin  lib  nith_result_api  nithconnect-dockerignore.backup  session-service.patch
```

After deploying, it will cleanly sit right next to it:
```bash
ubuntu@nithconnect-backend-amp:~$ ls
MoneyGame    NithConnect   bin   lib   nith_result_api
```

---

## Step 1: Copy or Clone MoneyGame to Your Oracle VM

From your local machine, sync or push this folder:
```bash
# Option A: Using scp / rsync from your local machine
rsync -avz --exclude 'node_modules' --exclude 'dev.db' /home/gulshan/Projects/MoneyGame ubuntu@132.226.186.196:~/MoneyGame

# OR Option B: Push to a GitHub repository and git clone on your VM
ssh ubuntu@132.226.186.196
git clone <YOUR_MONEY_GAME_REPO_URL> MoneyGame
```

---

## Step 2: Dedicated Side-by-Side Database (Zero Interference with NithConnect)

MoneyGame now includes its own dedicated PostgreSQL container (`money_game_db`) in `docker-compose.yml`.
- It uses its own isolated Docker volume (`moneygame_pgdata`).
- It binds to host port `5433` (while `nith_connect_db` stays on `5432`), guaranteeing zero conflict.
- You do **NOT** need to create databases or touch `nith_connect_db` at all!

---

## Step 3: Configure `.env` on Your Oracle VM

Inside `~/MoneyGame` on your VM, copy the Oracle template:
```bash
cd ~/MoneyGame
cp .env.oracle.example .env
nano .env
```

Generate secure 32+ character secrets:
```bash
# Generate secrets:
openssl rand -hex 32   # for JWT_SECRET
openssl rand -hex 32   # for WEBHOOK_SECRET
```

Set your values in `.env`:
```ini
PORT=4000
NODE_ENV=production

# Dedicated database configuration
POSTGRES_DB=money_game
POSTGRES_USER=money_user
POSTGRES_PASSWORD=choose_a_strong_password
POSTGRES_PORT=5433
DATABASE_URL="postgresql://money_user:choose_a_strong_password@money_game_db:5432/money_game?schema=public"

ADMIN_UPI_ID="your_real_upi@bank"
ADMIN_UPI_NAME="Your Business Name"
PLATFORM_COMMISSION_PERCENT=10
WEBHOOK_SECRET="<YOUR_GENERATED_WEBHOOK_SECRET>"
JWT_SECRET="<YOUR_GENERATED_JWT_SECRET>"
ADMIN_INITIAL_EMAIL="admin@moneygame.com"
ADMIN_INITIAL_PASSWORD="your_unique_admin_password_123"
ADMIN_INITIAL_PHONE="9999999999"
ALLOWED_ORIGINS="*"
```

---

## Step 4: Open Port 4000 on Oracle Cloud Console & Firewall

1. **In Oracle Cloud Console:**
   * Go to **Networking** $\rightarrow$ **Virtual Cloud Networks** $\rightarrow$ Click your VCN $\rightarrow$ **Security Lists** $\rightarrow$ **Default Security List**.
   * Click **Add Ingress Rule**:
     * **Source CIDR:** `0.0.0.0/0`
     * **IP Protocol:** `TCP`
     * **Destination Port Range:** `4000`
2. **In your VM terminal, allow traffic through iptables:**
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 4000 -j ACCEPT
   sudo netfilter-persistent save
   ```

---

## Step 5: Start MoneyGame via Docker Compose

```bash
cd ~/MoneyGame
docker compose up -d --build
```

Check the logs:
```bash
docker compose logs -f money_game_app
```

You can now visit `http://132.226.186.196:4000` from any browser!

---

## Step 6: Connect Android Notification Listener (0% Fee Webhook)

On your spare Android phone running YouPI-PG companion app / Tasker / MacroDroid:
* Target Webhook URL: `http://132.226.186.196:4000/api/webhooks/upi-notify`
* Header: `x-webhook-secret: your-random-secret-key`
* Body:
  ```json
  {
    "amount": 100.14,
    "utr": "429384729182"
  }
  ```
Whenever a payment arrives, your Android phone will forward it directly to your Oracle VM and auto-approve the deposit within 2 seconds.

---

## Step 7: Free SSL for Backend (No Domain Purchase Required)

You do **not** need to buy a domain. Choose either Option A (simplest) or Option B:

### Option A: Free Public Wildcard Domain (`sslip.io`) with Let's Encrypt
`sslip.io` maps any IP into a valid domain automatically without setup. For your VM (`132.226.186.196`):
- Domain: `132-226-186-196.sslip.io` (resolves directly to `132.226.186.196`)
- Install Certbot on your VM to get a 100% free Let's Encrypt SSL certificate:
  ```bash
  sudo apt update && sudo apt install -y certbot nginx
  sudo certbot certonly --standalone -d 132-226-186-196.sslip.io
  ```

### Option B: Cloudflare Tunnel (100% Free HTTPS & WSS, No Port Forwarding)
1. Install `cloudflared` on your VM:
   ```bash
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared.deb
   ```
2. Run a free instant tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:4000
   ```
   Cloudflare will give you a free `https://*.trycloudflare.com` URL with automatic SSL and WebSocket support!

---

## Step 8: Deploy Web Apps to Firebase Hosting (Optional Free Option)

If you wish to host `user-web` and `admin-web` on Firebase Hosting:

1. Build both web portals with your backend URL:
   ```bash
   # In local repo:
   VITE_API_URL=https://132-226-186-196.sslip.io npm run build:user-web
   VITE_API_URL=https://132-226-186-196.sslip.io npm run build:admin-web
   ```
2. Initialize Firebase in this folder:
   ```bash
   firebase login
   firebase target:apply hosting user-web <YOUR_FIREBASE_USER_SITE_NAME>
   firebase target:apply hosting admin-web <YOUR_FIREBASE_ADMIN_SITE_NAME>
   ```
3. Deploy to Firebase Hosting:
   ```bash
   firebase deploy --only hosting
   ```
   Both web apps will now be live on free, fast global CDN with free SSL (e.g. `https://my-game.web.app`)!
