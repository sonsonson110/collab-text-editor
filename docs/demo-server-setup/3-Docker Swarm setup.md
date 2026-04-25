# Docker Swarm — Setup Guide

A complete walkthrough for installing Docker Engine and initializing Docker Swarm on your Virtual Machine, transforming it into a robust container orchestration environment ready to host our application stack.

Reference: [Docker Engine Installation Docs](https://docs.docker.com/engine/install/ubuntu/), [Docker Swarm Setup Docs](https://docs.docker.com/engine/swarm/swarm-tutorial/create-swarm/)

---

## Prerequisites

- SSH access to your VM (completed in Phase 1)
- `sudo` privileges on the VM

---

## Part 1 — Install Docker Engine

### Step 1.1 — Set up the Docker repository

**Purpose:** Add Docker's official GPG key and repository so `apt` can download the latest official Docker packages instead of the older versions provided by Ubuntu's default repositories.

**Action (inside the VM via SSH):**
```bash
# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
```

---

### Step 1.2 — Install Docker packages

**Purpose:** Install the Docker Engine, the command-line interface, and the Docker Compose plugin required for our deployment.

**Action:**
```bash
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

---

### Step 1.3 — Run Docker without `sudo` (Optional but recommended)

**Purpose:** Allow your current user to run Docker commands without needing to type `sudo` every time.

**Action:**
1. Add your user to the docker group:
   ```bash
   sudo usermod -aG docker $USER
   ```
2. Apply the group membership to your current session immediately:
   ```bash
   newgrp docker
   ```

**Verify:**
```bash
docker ps
```
*(This should run without permission errors. If it fails, log out of the SSH session with `exit` and log back in.)*

---

## Part 2 — Initialize Docker Swarm

### Step 2.1 — Enable Swarm mode

**Purpose:** Convert the standalone Docker Engine into a Swarm manager node. This enables advanced features like secrets management, overlay networks, and stack deployments.

**Action:**
```bash
docker swarm init
```
*If your VM has multiple network interfaces and Docker asks for an `--advertise-addr`, you can specify the local IP of your VM (e.g., `docker swarm init --advertise-addr 10.0.2.15`).*

**Expected Output:**
```
Swarm initialized: current node (xxxxxx) is now a manager.
```

---

### Step 2.2 — Verify Swarm status

**Purpose:** Confirm that the Swarm cluster is active and your VM is acting as the leader node.

**Action:**
```bash
docker node ls
```
You should see your VM listed with a `*` next to its ID, and the Manager Status should be `Leader`.

---

## Part 3 — Configure Firewall (Optional)

### Step 3.1 — Install UFW and allow essential traffic

**Purpose:** Install and secure the VM using Uncomplicated Firewall (UFW) while explicitly allowing SSH, Docker Swarm management, and web traffic.

**Action:**
```bash
# Install UFW (not included by default on all Ubuntu Server editions)
sudo apt-get update
sudo apt-get install -y ufw

# VERY IMPORTANT: Always allow SSH first so you don't lock yourself out!
sudo ufw allow ssh

# Allow HTTP/HTTPS traffic (for the application)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow Docker Swarm routing and overlay network traffic
sudo ufw allow 2377/tcp
sudo ufw allow 7946/tcp
sudo ufw allow 7946/udp
sudo ufw allow 4789/udp
```

---

### Step 3.2 — Enable UFW

**Purpose:** Turn on the firewall to enforce the rules created above.

**Action:**
```bash
sudo ufw enable
```
Press `y` if it warns about disrupting existing SSH connections.

**Verify:**
```bash
sudo ufw status
```

---

## Summary

| What was set up | How it works |
|---|---|
| Docker Engine | Container runtime installed and running as a system service. |
| User Group | Your SSH user can execute `docker` commands without `sudo`. |
| Docker Swarm | VM initialized as a Swarm Manager, ready to accept distributed application stacks and manage Docker Secrets. |
| UFW Rules | Firewall configured to secure the VM while keeping ports open for SSH, Swarm networking, and HTTP traffic. |

Your VM is now fully prepared to orchestrate containers. The final step (Phase 4) will be deploying the collaborative text editor stack onto this Swarm.
