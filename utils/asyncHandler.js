/**
 * Wraps an async function to handle errors without try/catch blocks
 * This eliminates the need to use try/catch blocks in every async middleware or controller
 * @param {Function} fn - The async function to be wrapped
 * @returns {Function} - Express middleware function that handles async errors
 */
export const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
