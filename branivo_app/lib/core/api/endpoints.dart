/// All API URL constants — NEVER hardcode URLs elsewhere in the app.
class ApiEndpoints {
  ApiEndpoints._();

  static const String _baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://192.168.1.31:3000',
  );

  static const String _ocrServiceUrl = String.fromEnvironment(
    'OCR_SERVICE_URL',
    defaultValue: 'http://192.168.1.31:8888',
  );

  static String get baseUrl => _baseUrl;
  static String get ocrServiceBaseUrl => _ocrServiceUrl;

  // Auth
  static String get login => '$_baseUrl/api/v1/auth/login';
  static String get refresh => '$_baseUrl/api/v1/auth/refresh';
  static String get logout => '$_baseUrl/api/v1/auth/logout';
  static String get sendOtp => '$_baseUrl/api/v1/auth/otp/send';
  static String get verifyOtp => '$_baseUrl/api/v1/auth/otp/verify';

  // Password reset
  static String get passwordResetSendOtp =>
      '$_baseUrl/api/v1/auth/password-reset/send-otp';
  static String get passwordResetVerifyOtp =>
      '$_baseUrl/api/v1/auth/password-reset/verify-otp';
  static String get passwordResetConfirm =>
      '$_baseUrl/api/v1/auth/password-reset/confirm-otp';

  // Quotes
  static String get quotes => '$_baseUrl/api/v1/quotes';
  static String quoteById(String id) => '$_baseUrl/api/v1/quotes/$id';

  // Policies
  static String get policies => '$_baseUrl/api/v1/policies';
  static String policyById(String id) => '$_baseUrl/api/v1/policies/$id';

  // OCR (NestJS backend)
  static String get ocrScan => '$_baseUrl/api/v1/ocr/scan';
  static String get ocrReportMlKit => '$_baseUrl/api/v1/ocr/report-mlkit-scan';
  static String get ocrVisionScan => '$_baseUrl/api/v1/ocr/vision-scan';
  static String get ocrLog => '$_baseUrl/api/v1/ocr/log';

  // Vehicle enrichment
  static String get vehicleEnrich => '$_baseUrl/api/v1/vehicles/enrich';

  // Vehicle catalog (public — no auth required)
  static String get vehicleCatalogMakes =>
      '$_baseUrl/api/v1/vehicle-catalog/makes';
  static String get vehicleCatalogModels =>
      '$_baseUrl/api/v1/vehicle-catalog/models';
  static String get vehicleCatalogModifications =>
      '$_baseUrl/api/v1/vehicle-catalog/modifications';

  // branivo-ocr Python microservice
  static String ocrTalon(int step) => '$_ocrServiceUrl/ocr/talon?step=$step';

  // Compliance (public — no auth required)
  static String privacyPolicy({String lang = 'bg'}) =>
      '$_baseUrl/api/v1/public/privacy-policy?lang=$lang';

  // Health
  static String get health => '$_baseUrl/health';
}
