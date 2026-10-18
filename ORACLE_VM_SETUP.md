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

## Step 2: Create the `money_game` Database in Existing Postgres

Your VM already has PostgreSQL running inside the `nith_connect_db` container. You do **not** need to install another database. Just create a new database inside it:

```bash
# On your Oracle VM terminal:
docker exec -it nith_connect_db psql -U nith_user -d postgres -c "CREATE DATABASE money_game;"
```

---

## Step 3: Configure `.env` on Your Oracle VM

Inside `~/MoneyGame` on your VM, copy the Oracle template:
```bash
cd ~/MoneyGame
cp .env.oracle.example .env
nano .env
```

Ensure the `DATABASE_URL` matches your existing Postgres password (from `~/NithConnect/backend/.env`):
```ini
PORT=4000
NODE_ENV=production
DATABASE_URL="postgresql://nith_user:YOUR_NITH_POSTGRES_PASSWORD@127.0.0.1:5432/money_game?schema=public"
ADMIN_UPI_ID="your_real_upi@bank"
ADMIN_UPI_NAME="Your Business Name"
WEBHOOK_SECRET="create-a-random-secret-key"
PLATFORM_COMMISSION_PERCENT=10
```

*(Note: If you use Docker, Docker automatically detects PostgreSQL from DATABASE_URL and configures the schema for you!)*

If running directly on the host without Docker:
```bash
cp apps/server/prisma/schema.postgresql.prisma apps/server/prisma/schema.prisma
npx prisma db push --schema=apps/server/prisma/schema.prisma
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
