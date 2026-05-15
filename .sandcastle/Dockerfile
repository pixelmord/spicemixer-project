FROM node:24-bookworm

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
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate \
 && chmod -R a+rwX /opt/corepack

# Pin pnpm's content-addressable store outside the bind-mounted workspace.
# Without this, pnpm detects that ~/.pnpm-store and the bind-mounted
# workspace are on different filesystems, refuses to hardlink across them,
# and writes the store at <workspace>/.pnpm-store instead. That store
# (~650MB) then leaks back to the host through the bind-mount, gets
# scanned by oxlint/oxfmt during `vp check` (causing minutes-long hangs),
# trips dirty-worktree detection in sandcastle (so worktrees never clean
# up after sandbox.close), and risks being swept into commits by any
# overzealous `git add -A`. Putting the store on /home (container overlay
# FS) keeps it off the host. Hardlinks still won't span filesystems, so
# pnpm copies instead — slower install, but correct isolation.
ENV npm_config_store_dir=/home/agent/.pnpm-store

# Install Vite+ globally so `vp` is on PATH for the agent (vp check / vp test).
# The project also pulls vite-plus locally via pnpm, but a global install means
# prompts can call `vp` directly without `pnpm exec` shimming.
RUN npm install -g vite-plus

# Build-args for UID/GID alignment: sandcastle docker build-image
# defaults these to the host user's UID/GID so image-built files
# and bind-mounted files share an owner without runtime chown.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Rename the base image's "node" user to "agent" and align UID/GID.
# `-o` permits non-unique IDs: macOS hosts often use GID 20 (staff) / UID 501-502,
# which collide with Debian's pre-existing `dialout` group / system users. The
# container is ephemeral, so sharing the numeric ID is harmless.
RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude (and pnpm/corepack shims under the agent user) to PATH.
ENV PATH="/home/agent/.local/bin:$PATH"

WORKDIR /home/agent

# Make /home/agent writable to any UID. Sandcastle's docker provider runs
# the container with `--user $HOST_UID:$HOST_GID` (see sandboxes/docker.js).
# The AGENT_UID/AGENT_GID build-args above usually align this, but if the
# image is built without passing them (e.g. cached layer reuse, manual
# `docker build`), the runtime UID won't match the in-image `agent` user
# and git/claude/pnpm can't write their config files under /home/agent
# (e.g. `git config --global` fails with "could not lock config file
# /home/agent/.gitconfig: Permission denied" during `safe.directory`
# setup). The container is ephemeral, so the loose perms are scoped to a
# single sandbox run.
USER root
RUN chmod -R a+rwX /home/agent
USER ${AGENT_UID}:${AGENT_GID}

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
