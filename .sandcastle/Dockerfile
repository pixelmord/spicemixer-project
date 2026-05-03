FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Tell every tool in here it's running non-interactively. pnpm in
# particular needs CI=true to skip its "remove existing node_modules?"
# confirmation prompt (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY) when
# the bind-mounted node_modules from the host is platform-incompatible
# (macOS vs. Linux). General CI env benefits other tools too.
ENV CI=true

# Enable corepack so the project's pinned pnpm (packageManager field) activates
# automatically. pnpm install --frozen-lockfile is invoked from main.ts hooks.
# COREPACK_ENABLE_DOWNLOAD_PROMPT=0 suppresses the interactive "about to
# download" prompt — corepack would otherwise refuse to fetch in the
# sandbox's non-TTY exec context. Pre-preparing pnpm at build time pulls
# the tarball into /opt/corepack now, so first `pnpm install` is offline.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate \
 && chmod -R a+rX /opt/corepack

# Install Vite+ globally so `vp` is on PATH for the agent (vp check / vp test).
# The project also pulls vite-plus locally via pnpm, but a global install means
# prompts can call `vp` directly without `pnpm exec` shimming.
RUN npm install -g vite-plus

# Rename the base image's "node" user (UID 1000) to "agent".
# This keeps UID 1000 so that --userns=keep-id (Podman) and
# --user 1000:1000 (Docker) map to the correct home directory owner.
RUN usermod -d /home/agent -m -l agent node
USER agent

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude (and pnpm/corepack shims under the agent user) to PATH.
ENV PATH="/home/agent/.local/bin:$PATH"

WORKDIR /home/agent

# Make /home/agent writable to any UID. Sandcastle's docker provider runs
# the container with `--user $HOST_UID:$HOST_GID` (see sandboxes/docker.js).
# On macOS that's typically UID 501 or 502 — different from the in-image
# `agent` user (UID 1000). Without these chmods, git/claude/pnpm cannot
# write their config files under /home/agent (e.g. `git config --global`
# fails with "could not lock config file /home/agent/.gitconfig: Permission
# denied" during `safe.directory` setup). The container is ephemeral, so
# the loose perms are scoped to a single sandbox run.
USER root
RUN chmod -R a+rwX /home/agent
USER agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
