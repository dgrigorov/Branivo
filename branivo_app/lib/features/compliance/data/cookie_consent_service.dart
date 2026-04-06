import 'package:dio/dio.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../../../core/api/endpoints.dart';

const _kBoxName = 'cookie_consent';
const _kKeyNecessary = 'necessary';
const _kKeyAnalytics = 'analytics';
const _kKeyMarketing = 'marketing';
const _kKeyFunctional = 'functional';
const _kKeyConsentedAt = 'consentedAt';

class CookieConsentService {
  CookieConsentService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  Future<bool> hasGivenConsent() async {
    final box = await Hive.openBox<dynamic>(_kBoxName);
    final consentedAt = box.get(_kKeyConsentedAt);
    return consentedAt != null && (consentedAt as String).isNotEmpty;
  }

  Future<void> saveConsent({
    required bool analytics,
    required bool marketing,
    bool functional = false,
    bool syncBackend = true,
  }) async {
    final box = await Hive.openBox<dynamic>(_kBoxName);
    final consentedAt = DateTime.now().toIso8601String();

    await box.put(_kKeyNecessary, true);
    await box.put(_kKeyAnalytics, analytics);
    await box.put(_kKeyMarketing, marketing);
    await box.put(_kKeyFunctional, functional);
    await box.put(_kKeyConsentedAt, consentedAt);

    if (syncBackend) {
      try {
        await _dio.post<void>(
          ApiEndpoints.cookieConsentSave,
          data: {
            'necessary': true,
            'analytics': analytics,
            'marketing': marketing,
            'functional': functional,
          },
        );
      } catch (_) {
        // Best-effort sync — local consent is the source of truth
      }
    }
  }

  bool get canTrackAnalytics {
    // Box may not be open yet (e.g. called before hasGivenConsent()) — default to false.
    if (!Hive.isBoxOpen(_kBoxName)) return false;
    return Hive.box<dynamic>(_kBoxName).get(_kKeyAnalytics, defaultValue: false) as bool;
  }

  bool get canUseMarketing {
    // Box may not be open yet — default to false.
    if (!Hive.isBoxOpen(_kBoxName)) return false;
    return Hive.box<dynamic>(_kBoxName).get(_kKeyMarketing, defaultValue: false) as bool;
  }

  Map<String, dynamic> getCurrentConsent() {
    // Box may not be open yet — return safe defaults.
    if (!Hive.isBoxOpen(_kBoxName)) {
      return {
        _kKeyNecessary: true,
        _kKeyAnalytics: false,
        _kKeyMarketing: false,
        _kKeyFunctional: false,
        _kKeyConsentedAt: null,
      };
    }
    final box = Hive.box<dynamic>(_kBoxName);
    return {
      _kKeyNecessary: true,
      _kKeyAnalytics: box.get(_kKeyAnalytics, defaultValue: false) as bool,
      _kKeyMarketing: box.get(_kKeyMarketing, defaultValue: false) as bool,
      _kKeyFunctional: box.get(_kKeyFunctional, defaultValue: false) as bool,
      _kKeyConsentedAt: box.get(_kKeyConsentedAt) as String?,
    };
  }
}
