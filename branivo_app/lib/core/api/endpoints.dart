/// All API URL constants — NEVER hardcode URLs elsewhere in the app.
class ApiEndpoints {
  ApiEndpoints._();

  static const String _baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  static String get baseUrl => _baseUrl;

  // Auth
  static String get login => '$_baseUrl/api/v1/auth/login';
  static String get refresh => '$_baseUrl/api/v1/auth/refresh';
  static String get logout => '$_baseUrl/api/v1/auth/logout';
  static String get sendOtp => '$_baseUrl/api/v1/auth/otp/send';
  static String get verifyOtp => '$_baseUrl/api/v1/auth/otp/verify';

  // Quotes
  static String get quotes => '$_baseUrl/api/v1/quotes';
  static String quoteById(String id) => '$_baseUrl/api/v1/quotes/$id';

  // Policies
  static String get policies => '$_baseUrl/api/v1/policies';
  static String policyById(String id) => '$_baseUrl/api/v1/policies/$id';

  // OCR
  static String get ocrScan => '$_baseUrl/api/v1/ocr/scan';

  // Health
  static String get health => '$_baseUrl/health';
}
