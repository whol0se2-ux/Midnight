FROM diegosouzapw/omniroute:3.8.51

USER root
COPY --chown=node:node gateway.mjs /app/gateway.mjs
USER node

CMD ["node", "/app/gateway.mjs"]
