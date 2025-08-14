export const logger = {
  debug: (message: string, data?: any) => console.debug(message, data),
  info: (message: string, data?: any) => console.info(message, data),
  warn: (message: string, data?: any) => console.warn(message, data),
  error: (message: string, data?: any) => console.error(message, data)
};
