process.env.JWT_SECRET = Buffer.from(
  "test-secret-key-that-is-long-enough",
).toString("base64");
process.env.INTERNAL_API_SECRET = "test-internal-api-secret";
