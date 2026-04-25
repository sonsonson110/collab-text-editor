# Cloudflare Tunnel — Setup Guide

A complete walkthrough for securely exposing your local Virtual Machine to the public internet using Cloudflare Tunnel, eliminating the need to configure port forwarding or dynamic DNS on your home router.

Reference: [Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)

---

## Prerequisites

- SSH access to your VM (completed in Phase 1)

> **Note:** This guide prioritizes the **Free Quick Tunnel** method, which does not require you to own a domain or have a Cloudflare account. If you *do* own a domain and want a permanent URL, see the **Alternative: Permanent Custom Domain** section at the bottom.

---

## Part 1 — Create a Free Quick Tunnel

### Step 1.1 — Install cloudflared on the VM

**Purpose:** Download and install the Cloudflare daemon.

**Action (inside the VM via SSH):**
```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && 
sudo dpkg -i cloudflared.deb
```

### Step 1.2 — Start the Quick Tunnel

**Purpose:** Securely link your VM to a random public URL provided by Cloudflare.

**Action (inside the VM via SSH):**
Run the following command. It will stay running in your terminal and print out a temporary random URL.
```bash
cloudflared tunnel --url http://localhost:80
```

> [!IMPORTANT]
> Keep this terminal open! Look for the line that says `Your quick Tunnel has been created! Visit it at (https://...trycloudflare.com)`. **Save this random URL**, as you will need it for the deployment phase.

---

## Alternative: Permanent Custom Domain (Requires owned domain)

If you own a domain and want a persistent URL (e.g., `collab.yourdomain.com`), follow these steps instead of the Quick Tunnel above.

### Step A.1 — Create the Tunnel via Dashboard

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. On the left sidebar, click on **Zero Trust**
3. In the Zero Trust dashboard, go to **Networks → Connectors → Tunnels**
4. Click the **Add a tunnel** button
5. Select **Cloudflared** as the connector type and click Next
6. Name your tunnel (e.g., `myvps-tunnel` or `demo-server`)
7. Click **Save tunnel**

### Step A.2 — Install and Authenticate on the VM

1. On the "Install and run a connector" screen, select your environment (Debian / 64-bit).
2. Copy the installation command provided.
3. Paste and run the command inside your VM via SSH. It will look similar to:
   ```bash
   curl -L --output cloudflared.deb ... && sudo dpkg -i cloudflared.deb && sudo cloudflared service install eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
4. Wait for installation. Confirm status with `sudo systemctl status cloudflared`.

### Step A.3 — Route Traffic to the Application

1. In the "Route traffic" screen, under the **Public Hostname** tab
2. Configure the public URL:
   - **Subdomain:** `collab-text-editor` (or your desired subdomain)
   - **Domain:** Select your domain from the dropdown
   - **Path:** Leave blank
3. Configure the local service:
   - **Type:** `HTTP`
   - **URL:** `localhost:80`
4. Click **Save hostname**

---

## Summary

| What was set up | How it works |
|---|---|
| `cloudflared` | Runs on the VM, initiating outbound secure traffic only. |
| Zero Trust Tunnel | Securely links Cloudflare's edge network to your VM without opening inbound ports. |
| Access Route | Forwards all requests for your public URL securely through the tunnel to `localhost:80` on the VM. The Docker Swarm handles routing the traffic to the frontend or backend. |

Your VM is now securely wired to the public internet. The next step is setting up Docker Swarm to host the application.
