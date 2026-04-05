import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

class BiometricAuthService {
  BiometricAuthService({
    required FlutterSecureStorage storage,
    LocalAuthentication? localAuth,
  })  : _storage = storage,
        _auth = localAuth ?? LocalAuthentication();

  final FlutterSecureStorage _storage;
  final LocalAuthentication _auth;

  static const kBiometricEnabled = 'biometric_enabled';
  static const kFailureCount = 'biometric_failure_count';
  static const kPromptShown = 'biometric_prompt_shown';
  static const kMaxFailures = 3;

  /// Checks if the device supports biometrics and has enrolled biometrics.
  Future<bool> isAvailable() async {
    if (!await _auth.isDeviceSupported()) return false;
    final biometrics = await _auth.getAvailableBiometrics();
    return biometrics.isNotEmpty;
  }

  /// Returns the available biometric types (face, fingerprint, etc.).
  Future<List<BiometricType>> availableBiometrics() =>
      _auth.getAvailableBiometrics();

  /// Triggers the OS biometric prompt. Returns true if authentication succeeded.
  Future<bool> authenticate() => _auth.authenticate(
        localizedReason: 'Влезте бързо с биометрия',
        options: const AuthenticationOptions(
          biometricOnly: true,
          stickyAuth: true,
        ),
      );

  /// Whether the user has opted in to biometric login.
  Future<bool> isEnabled() async {
    final val = await _storage.read(key: kBiometricEnabled);
    return val == 'true';
  }

  /// Enables biometric login (stores flag in Keychain / Keystore).
  Future<void> enable() =>
      _storage.write(key: kBiometricEnabled, value: 'true');

  /// Disables biometric login and resets the failure counter.
  Future<void> disable() async {
    await _storage.delete(key: kBiometricEnabled);
    await _storage.delete(key: kFailureCount);
  }

  /// Returns the current consecutive failure count.
  Future<int> getFailureCount() async {
    final val = await _storage.read(key: kFailureCount);
    return int.tryParse(val ?? '0') ?? 0;
  }

  /// Increments the failure counter by 1 and returns the new count.
  Future<int> incrementFailureCount() async {
    final count = await getFailureCount();
    final newCount = count + 1;
    await _storage.write(key: kFailureCount, value: '$newCount');
    return newCount;
  }

  /// Resets the failure counter to 0.
  Future<void> resetFailureCount() => _storage.delete(key: kFailureCount);

  /// Whether the maximum consecutive failure threshold has been reached.
  Future<bool> isLocked() async => await getFailureCount() >= kMaxFailures;

  /// Whether the biometric setup prompt has already been shown to the user.
  Future<bool> wasPromptShown() async {
    final val = await _storage.read(key: kPromptShown);
    return val == 'true';
  }

  /// Marks the biometric setup prompt as shown (won't show again).
  Future<void> markPromptShown() =>
      _storage.write(key: kPromptShown, value: 'true');
}
