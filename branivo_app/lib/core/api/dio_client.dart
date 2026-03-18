import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'endpoints.dart';

class DioClient {
  DioClient._();

  static final Dio _instance = _createDio();

  static Dio get instance => _instance;

  static Dio _createDio() {
    final dio = Dio(
      BaseOptions(
        baseUrl: ApiEndpoints.baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 30),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    dio.interceptors.add(_AuthInterceptor(dio));
    return dio;
  }
}

class _AuthInterceptor extends QueuedInterceptorsWrapper {
  _AuthInterceptor(this._dio);

  final Dio _dio;
  final _storage = const FlutterSecureStorage();

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _storage.read(key: 'access_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }

    final tenantSlug = await _storage.read(key: 'tenant_slug');
    if (tenantSlug != null) {
      options.headers['X-Tenant-Slug'] = tenantSlug;
    }

    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401) {
      try {
        final refreshToken = await _storage.read(key: 'refresh_token');
        if (refreshToken == null) return handler.next(err);

        final response = await _dio.post<Map<String, dynamic>>(
          ApiEndpoints.refresh,
          data: {'refreshToken': refreshToken},
        );

        final data = response.data?['data'] as Map<String, dynamic>?;
        final newToken = data?['accessToken'] as String?;
        final newRefresh = data?['refreshToken'] as String?;

        if (newToken != null) {
          await _storage.write(key: 'access_token', value: newToken);
        }
        if (newRefresh != null) {
          await _storage.write(key: 'refresh_token', value: newRefresh);
        }

        err.requestOptions.headers['Authorization'] = 'Bearer $newToken';
        final retryResponse = await _dio.fetch<dynamic>(err.requestOptions);
        return handler.resolve(retryResponse);
      } catch (_) {
        await _storage.deleteAll();
        return handler.next(err);
      }
    }
    handler.next(err);
  }
}
