// Standard API response format
export class ApiResponse {
    constructor(statusCode, data, message = null) {
      this.success = statusCode >= 200 && statusCode < 300;
      this.statusCode = statusCode;
      this.data = data;
      if (message) {
        this.message = message;
      }
    }
  
    static success(res, data, message = 'Operation successful', statusCode = 200) {
      return res.status(statusCode).json({
        success: true,
        message,
        data
      });
    }
  
    static error(res, message = 'Operation failed', statusCode = 500) {
      return res.status(statusCode).json({
        success: false,
        message
      });
    }
  }