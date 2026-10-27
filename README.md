# Midnight

OmniRoute gateway for Midnight Arcade on Hostless.

This repository deploys the official OmniRoute 3.8.51 image on a 1 GB Hostless app. Hostless currently advertises a no-card free allowance of 0.5 vCPU and 1 GB RAM with no idle sleep. The deployment uses that entire compute allowance. Check the plan details before adding other services.

The gateway exposes `GET /health`, token-protected `POST /v1/chat/completions`, and `GET /games/<path>` for the Midnight Arcade game catalog. It does not expose the OmniRoute dashboard. Set `MIDNIGHT_BRIDGE_TOKEN` as a Hostless secret before deployment, then set the same token in Base44's secrets. Do not put it in this repository or the browser frontend.

The game route serves files on demand from the pinned `tw31122007/HTML-Games-V2` revision in `game-manifest.json`. The manifest allows only files present in that revision. Games run on the Hostless origin, separate from the Base44 site and its passcode storage. Game rights remain with their creators; the upstream repository has no repository-wide redistribution license. Some upstream games may rely on third-party services or browser features that no longer work.

OmniRoute's local SQLite data is temporary on Hostless. Provider accounts added inside the container will disappear after redeployment. The intended model is OmniRoute's built-in no-auth `ddgw/gpt-5.4-mini`, which was tested on a 1 GB Fly machine. This upstream can change or rate-limit requests. Midnight Arcade should retain Base44's hosted AI fallback.

To deploy, create a Git repository containing these files, connect it to a Hostless app, choose Docker build, and set the `MIDNIGHT_BRIDGE_TOKEN` secret before the initial deploy. The app must use the 1 GB / 0.5 vCPU settings in `hostless.yaml`. After Hostless assigns an HTTPS address, test `/health`, test that `/` returns 404 and unauthenticated chat returns 401, then test an authenticated chat. Only after those checks should Base44's `OMNIROUTE_BASE_URL` and `OMNIROUTE_MODEL=ddgw/gpt-5.4-mini` secrets be added.

Sources: [Hostless plans and limits](https://docs.hostless.cloud/plans/limits), [Hostless app runtime](https://docs.hostless.cloud/app/overview), [OmniRoute Docker guide](https://omniroute.hagicode.com/en-US/guides/docker-guide/).
