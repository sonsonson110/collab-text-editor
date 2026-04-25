# Demo Server Setup Roadmap

This documentation series outlines the steps to practice deploying the application to a production-like environment using a local Virtual Machine as a simulated VPS. This approach allows for realistic deployment practice without the cost or overhead of a cloud provider.

## Architecture Overview

- **Host:** Your local machine (Ubuntu Desktop).
- **Target (VPS):** A headless Ubuntu Server VM running in VirtualBox.
- **Exposure:** Cloudflare Tunnel to expose the local VM to the internet securely without requiring NAT port forwarding on your physical router.
- **Orchestration:** Docker Swarm to deploy and manage the application stack on the VM.

## Roadmap

### Phase 1: Infrastructure Setup (Completed)

**Goal:** Simulate a bare-metal VPS environment.

- [x] Create a headless Ubuntu Server VM in VirtualBox.
- [x] Configure NAT port forwarding to access the VM from the host.
- [x] Set up SSH access via keys and disable password authentication.
- **Documentation:** `1-Virtual Machine setup.md`

### Phase 2: Internet Exposure via Cloudflare Tunnel

**Goal:** Securely expose the VM to the public internet so the application can be accessed via a public domain name.

- [x] Create a Cloudflare account and obtain/configure a domain.
- [x] Install `cloudflared` daemon on the VM.
- [x] Authenticate `cloudflared` and create a new tunnel.
- [x] Route traffic from the public hostname to the internal Docker service ports (e.g., routing to an ingress network or a reverse proxy).
- [x] Run the tunnel as a persistent systemd service.
- **Documentation:** `2-Cloudflare Tunnel setup.md`

### Phase 3: Container Orchestration with Docker Swarm

**Goal:** Prepare the VM to host the application using Docker Swarm for robust deployment, scaling, and secrets management.

- [x] Install Docker Engine and Docker Compose plugin on the VM.
- [x] Initialize the VM as a Docker Swarm manager node.
- [x] (Optional) Configure firewall rules (UFW) to allow necessary Docker Swarm management traffic while restricting outside access.
- [x] Prepare deployment scripts or a Swarm-compatible `docker-compose.yml` (`docker-stack.yml`).
- **Documentation:** `3-Docker Swarm setup.md`

### Phase 4: Application Deployment

**Goal:** Deploy the actual collaborative text editor stack to the Swarm cluster.

- [ ] Build Docker images for the client and server components (or configure CI/CD to push them to a registry like GitHub Container Registry).
- [ ] Define Docker Secrets for sensitive environment variables (e.g., API keys, database credentials if any).
- [ ] Deploy the stack using `docker stack deploy`.
- [ ] Connect the Cloudflare Tunnel to the Swarm ingress (e.g., a reverse proxy like Traefik or Caddy running in the swarm, or directly to the client container).
- [ ] Verify end-to-end connectivity via the public domain.
- **Documentation:** `4-Deploying the Application.md` (Upcoming)
