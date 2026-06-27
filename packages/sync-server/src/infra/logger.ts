export const logger = {
  info: (tag: string, msg: string) => console.log(`[${tag}] ${msg}`),
  warn: (tag: string, msg: string) => console.warn(`[${tag}] ${msg}`),
  error: (tag: string, msg: string, err?: Error) => {
    if (err) {
      console.error(`[${tag}] ${msg}`, err);
    } else {
      console.error(`[${tag}] ${msg}`);
    }
  },
};
