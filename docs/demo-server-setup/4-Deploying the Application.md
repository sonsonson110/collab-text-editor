# Deploying the Application — Setup Guide

A complete walkthrough for deploying the collaborative text editor application stack to your local Docker Swarm and making it accessible via the Cloudflare Tunnel.

---

## Prerequisites

- A functioning Cloudflare Tunnel connected to your domain (completed in Phase 2)
- Docker Engine installed and Swarm mode initialized on your VM (completed in Phase 3)
- Your project's source code available on the host machine.
- A container registry account (e.g., Docker Hub or GitHub Container Registry).

---

## Part 1 — Build and Push Docker Images (Local Machine)

**Purpose:** Build the Docker images for your application locally and push them to a container registry so the VM can pull them directly without needing to transfer source code or build from scratch.

### Step 1.1 — Log in to your registry

**Action (on your local machine):**
```bash
# Log in to Docker Hub (or use ghcr.io for GitHub Container Registry)
docker login
```

### Step 1.2 — Build the images

**Action (on your local machine):**
Run the following commands in the root of your project. Replace `yourusername` with your actual registry username.
```bash
# Build the server image
docker build -t yourusername/collab-editor-server:latest -f packages/server/Dockerfile .

# Build the client image
# We pass the public WebSocket URL during the build so it connects through the Cloudflare Tunnel
# IMPORTANT: If using a Quick Tunnel, replace the URL below with your random trycloudflare.com URL!
# Make sure to use wss:// instead of https://, and append /ws to the end of the URL
docker build -t yourusername/collab-editor-client:latest \
  --build-arg VITE_WS_URL=wss://random-words.trycloudflare.com/ws \
  --build-arg VITE_ROOM_NAME=document-room \
  -f packages/client/Dockerfile .
```

### Step 1.3 — Push the images

**Action (on your local machine):**
```bash
docker push yourusername/collab-editor-server:latest
docker push yourusername/collab-editor-client:latest
```

---

## Part 2 — Prepare the Deployment Stack

### Step 2.1 — Create the `docker-stack.yml`

**Purpose:** Define all the components of the application (e.g., frontend client, collaboration server) in a single configuration file that Docker Swarm can distribute.

**Action (inside the VM via SSH):**
Create a file named `docker-stack.yml` on the VM:

```yaml
version: '3.8'

services:
  client:
    image: yourusername/collab-editor-client:latest # Ensure this matches the pushed image
    ports:
      - "80:80" # Maps port 80 on the VM to port 80 in the container
    networks:
      - collab-net
    deploy:
      replicas: 1
      update_config:
        parallelism: 1
        delay: 10s

  server:
    image: yourusername/collab-editor-server:latest # Ensure this matches the pushed image
    networks:
      - collab-net
    deploy:
      replicas: 1

networks:
  collab-net:
    driver: overlay
```

---

## Part 3 — Secure Environment Variables

### Step 3.1 — Create Docker Secrets (Optional)

**Purpose:** Store sensitive data like API keys or database credentials securely in the Swarm, rather than hardcoding them in plain text files.

**Action (inside the VM via SSH):**
If your application requires an API key, you can create a secret like this:
```bash
echo "your-super-secret-api-key" | docker secret create my_api_key -
```

*(You would then update `docker-stack.yml` to grant specific services access to `my_api_key`)*.

---

## Part 4 — Deploy the Stack

### Step 4.1 — Run the deployment command

**Purpose:** Instruct the Swarm manager to read your `docker-stack.yml` and spin up the defined containers (tasks).

**Action (inside the VM via SSH):**
Navigate to the directory containing your `docker-stack.yml` and run:
```bash
docker stack deploy -c docker-stack.yml collab-editor
```

**Expected Output:**
```
Creating network collab-editor_collab-net
Creating service collab-editor_client
Creating service collab-editor_server
```

---

### Step 4.2 — Verify the deployment

**Purpose:** Confirm that all services are running without crashing.

**Action:**
Check the status of the stack:
```bash
docker stack services collab-editor
```

You should see `1/1` under the `REPLICAS` column for both the client and the server.

If a service is failing, you can check its logs:
```bash
docker service logs collab-editor_client
```

---

## Part 5 — End-to-End Verification

### Step 5.1 — Test the connection

**Purpose:** Ensure the Cloudflare Tunnel is correctly routing public internet traffic to the newly deployed Docker container.

**Action:**
1. Open a web browser on your host machine (or your phone).
2. Navigate to the URL you configured or generated in Phase 2 (e.g., `https://random-words.trycloudflare.com` or `https://collab.yourdomain.com`).
3. You should now see your collaborative text editor loading securely over HTTPS!

---

## Summary

| What was set up | How it works |
|---|---|
| Local Image Push | Images are built locally with production variables and pushed to a remote registry. |
| `docker-stack.yml` | Declarative configuration describing the application architecture. |
| Docker Secrets | Encrypted storage for sensitive environment variables in the Swarm. |
| Swarm Stack | The application is pulled from the registry and runs as auto-restarting services on the VM. |
| End-to-End Access | Cloudflare Tunnel routes incoming domain traffic to port 80 of the Swarm ingress network, which hands it to the `client` container. |
| Reverse Proxy | The Nginx server in the `client` container serves the UI on `/` and proxies WebSocket traffic on `/ws/` to the hidden `server` container on port `1234`. |

Congratulations! You have successfully simulated deploying a full-stack application to a bare-metal VPS environment.
