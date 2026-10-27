FROM diegosouzapw/omniroute:3.8.51

USER root
COPY --chown=node:node gateway.mjs /app/gateway.mjs
COPY --chown=node:node game-proxy.mjs game-manifest.json /app/
USER node

CMD ["node", "/app/gateway.mjs"]
