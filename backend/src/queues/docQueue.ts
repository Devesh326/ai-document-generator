import Queue from "bull";

const docQueue = new Queue("doc-processing", {
  redis: {
    host: "127.0.0.1",
    port: 6379
  }
});

export {docQueue};