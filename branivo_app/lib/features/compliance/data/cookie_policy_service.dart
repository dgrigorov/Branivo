import 'package:dio/dio.dart';
import '../../../core/api/endpoints.dart';

class CookiePolicyData {
  final int version;
  final String content;
  final String language;
  final String? publishedAt;

  const CookiePolicyData({
    required this.version,
    required this.content,
    required this.language,
    this.publishedAt,
  });

  factory CookiePolicyData.fromJson(Map<String, dynamic> json) {
    return CookiePolicyData(
      version: json['version'] as int,
      content: json['content'] as String,
      language: json['language'] as String,
      publishedAt: json['publishedAt'] as String?,
    );
  }
}

class CookiePolicyService {
  CookiePolicyService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  Future<CookiePolicyData> fetchPublished({String lang = 'bg'}) async {
    final response = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.cookiePolicy(lang: lang),
      options: Options(extra: {'skipAuth': true}),
    );
    final body = response.data;
    if (body == null) {
      throw Exception('Empty response from cookie policy endpoint');
    }
    return CookiePolicyData.fromJson(body);
  }
}
