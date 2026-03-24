/// All API URL constants — NEVER hardcode URLs elsewhere in the app.
class ApiEndpoints {
  ApiEndpoints._();

  static const String _baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  static String get baseUrl => _baseUrl;

  // Auth
  static String get login => '$_baseUrl/auth/login';
  static String get refresh => '$_baseUrl/auth/refresh';
  static String get logout => '$_baseUrl/auth/logout';
  static String get sendOtp => '$_baseUrl/auth/otp/send';
  static String get verifyOtp => '$_baseUrl/auth/otp/verify';

  // Quotes
  static String get quotes => '$_baseUrl/quotes';
  static String quoteById(String id) => '$_baseUrl/quotes/$id';

  // Policies
  static String get policies => '$_baseUrl/policies';
  static String policyById(String id) => '$_baseUrl/policies/$id';

  // OCR
  static String get ocrScan => '$_baseUrl/ocr/scan';

  // Health
  static String get health => '$_baseUrl/../health';
}
