import 'package:dio/dio.dart';
import '../../../core/api/endpoints.dart';

class PrivacyPolicyData {
  final int version;
  final String content;
  final String language;
  final String? publishedAt;

  const PrivacyPolicyData({
    required this.version,
    required this.content,
    required this.language,
    this.publishedAt,
  });

  factory PrivacyPolicyData.fromJson(Map<String, dynamic> json) {
    return PrivacyPolicyData(
      version: json['version'] as int,
      content: json['content'] as String,
      language: json['language'] as String,
      publishedAt: json['publishedAt'] as String?,
    );
  }
}

class PrivacyPolicyService {
  PrivacyPolicyService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  Future<PrivacyPolicyData> fetchPublished({String lang = 'bg'}) async {
    final response = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.privacyPolicy(lang: lang),
      options: Options(extra: {'skipAuth': true}),
    );
    final body = response.data;
    if (body == null) {
      throw Exception('Empty response from privacy policy endpoint');
    }
    return PrivacyPolicyData.fromJson(body);
  }
}
