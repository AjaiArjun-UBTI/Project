// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "remit-backend",
      script: "server.ts",
      interpreter: "node",
      interpreter_args: "--loader ts-node/esm",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};