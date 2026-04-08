# Story 15.1: Biometric Login (Face ID & Fingerprint)

Status: done

## Story

As a returning end customer on mobile,
I want to log in using Face ID or fingerprint recognition,
So that I can access my policies instantly without entering a password.

## Acceptance Criteria

**AC1:** При отваряне на приложението от вече логнат потребител (с валиден refresh token в Keychain/Keystore) → биометричен prompt се стартира автоматично, ако биометрията е активирана.

**AC2:** При включване на биометрия (настройки) → `biometric_enabled = 'true'` се записва в `flutter_secure_storage`; refresh token вече е в Keychain/Keystore (винаги е бил там чрез `flutter_secure_storage`).

**AC3:** При успешна биометрия → `POST /api/v1/auth/refresh` с текущия refresh token → нов access + refresh token се записват → `AuthAuthenticatedState` се emitва.

**AC4:** При 3 поредни неуспешни биометрични опита → `biometric_failure_count` се изчиства от storage, `biometric_enabled` се set-ва на `'false'`, навигация към `/login` (SMS OTP flow).

**AC5:** При деактивирана биометрия в device settings (local_auth.isAvailable() = false) → приложението gracefully fallback-ва към `/login` без грешка.

**AC6:** В Settings screen → toggle „Бързо влизане с Face ID / пръстов отпечатък" — вкл/изкл биометрия; toggle е disabled ако устройството не поддържа биометрия.

**AC7:** Widget тест за biometric prompt (успех, 3 failures → fallback, device unavailable).

## Tasks / Subtasks

- [x] 1. Добави `local_auth` пакет в pubspec.yaml (AC: 1–6)
  - [x] `flutter pub add local_auth` (проверка за latest stable — v2.x)
  - [x] iOS: добави `NSFaceIDUsageDescription` в `ios/Runner/Info.plist`
  - [x] Android: добави `USE_BIOMETRIC` и `USE_FINGERPRINT` permissions в `android/app/src/main/AndroidManifest.xml`

- [x] 2. Създай `BiometricAuthService` (AC: 1, 3, 4, 5)
  - [x] Нов файл: `branivo_app/lib/features/auth/services/biometric_auth_service.dart`
  - [x] `isAvailable()` → `LocalAuthentication.isDeviceSupported()` + `getAvailableBiometrics()`
  - [x] `authenticate()` → `LocalAuthentication.authenticate(localizedReason: 'Влезте бързо с биометрия')`
  - [x] Storage keys (constants): `'biometric_enabled'`, `'biometric_failure_count'`
  - [x] `isEnabled()` → чете `'biometric_enabled'` от `flutter_secure_storage`
  - [x] `enable()` / `disable()` → write/delete в `flutter_secure_storage`
  - [x] `incrementFailureCount()` / `resetFailureCount()` / `getFailureCount()` → read/write `'biometric_failure_count'`

- [x] 3. Разшири `AuthBloc` с биометричен event (AC: 1, 3, 4)
  - [x] Добави `BiometricLoginRequestedEvent` в `auth_event.dart`
  - [x] Добави `_onBiometricLoginRequested` handler в `auth_bloc.dart`
  - [x] Handler flow: isAvailable check → authenticate → failure counter → refresh token → POST /auth/refresh
  - [x] `AuthBloc` вече приема `BiometricAuthService` като допълнителен параметър

- [x] 4. Добави биометрична кнопка в `LoginScreen` (AC: 1)
  - [x] В `login_screen.dart` → показвай биометрична кнопка ако `biometric_enabled = 'true'` и `isAvailable()`
  - [x] `onTap` → `context.read<AuthBloc>().add(BiometricLoginRequestedEvent())`
  - [x] UI: `Icons.fingerprint` с `OutlinedButton.icon` стил (следва `login_screen.dart` паттерн)

- [x] 5. Създай Settings screen с biometric toggle (AC: 6)
  - [x] Нов файл: `branivo_app/lib/features/settings/screens/settings_screen.dart`
  - [x] Toggle: `SwitchListTile` — „Бързо влизане с Face ID / пръстов отпечатък"
  - [x] Disable toggle ако `isAvailable() = false`; subtitle „Устройството не поддържа биометрия"
  - [x] При включване: `BiometricAuthService.enable()` + SnackBar „Биометрията е активирана"
  - [x] При изключване: `BiometricAuthService.disable()` + SnackBar „Биометрията е деактивирана"

- [x] 6. Регистрирай `/settings` route в `app_router.dart` (AC: 6)
  - [x] `GoRoute(path: '/settings', builder: ...)` → `SettingsScreen(biometricService: _biometricService)`
  - [x] `_biometricService` global instance добавен в `app_router.dart`

- [x] 7. Пиши widget тестове (AC: 7)
  - [x] Нов файл: `branivo_app/test/features/auth/biometric_auth_service_test.dart`
  - [x] Mock `LocalAuthentication` и `FlutterSecureStorage`
  - [x] 14 теста: isAvailable, isEnabled, enable/disable, failure counter, authenticate — всички минават

## Dev Notes

### Архитектурни решения — КРИТИЧНО

**ZERO API CHANGES:** Тази story е изцяло Flutter-side. Backend вече поддържа `POST /api/v1/auth/refresh` (от Story 1.3). Не се правят NestJS промени.

**Как работи биометрията:**
```
Успешна биометрия
  → прочети 'refresh_token' от flutter_secure_storage (Keychain/Keystore)
  → POST /api/v1/auth/refresh { refresh_token: "..." }
  → получи нов { access_token, refresh_token }
  → _storeTokens(tokens) — обнови двата токена
  → emit AuthAuthenticatedState(accessToken: newAccessToken)
```

**Биометричните данни НИКОГА не напускат устройството** — `local_auth` само верифицира чрез OS biometric API, не изпраща нищо към сървъра.

### Storage Keys (flutter_secure_storage)

| Key | Тип | Описание |
|-----|-----|----------|
| `access_token` | String | JWT access token (вече съществува) |
| `refresh_token` | String | JWT refresh token (вече съществува) |
| `biometric_enabled` | `'true'` / null | Флаг за активирана биометрия |
| `biometric_failure_count` | `'0'`..`'3'` / null | Брой поредни неуспехи |

### References

- Съществуващ AuthBloc: `branivo_app/lib/features/auth/bloc/auth_bloc.dart`
- Login screen UI: `branivo_app/lib/features/auth/screens/login_screen.dart`
- Architecture Epic 15 section: `_bmad-output/planning-artifacts/architecture.md#1439`
- Epics Story 15.1: `_bmad-output/planning-artifacts/epics.md#2092`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `AuthenticationOptions` fallback registration required for mocktail tests → added `FakeAuthenticationOptions extends Fake implements AuthenticationOptions` in `setUpAll`
- `activeColor` deprecated in Flutter 3.31+ → replaced with `activeThumbColor` + `activeTrackColor`
- `FlutterActivity` → `FlutterFragmentActivity` required for `local_auth` on Android

### Completion Notes List

- Имплементиран `BiometricAuthService` с injectable `LocalAuthentication` за testability
- `AuthBloc` разширен с `biometricService` параметър — всички съществуващи handler-и непроменени
- `LoginScreen` показва биометричен бутон само когато биометрия е достъпна И активирана (initState check)
- `SettingsScreen` добавен с `SwitchListTile` toggle — disabled когато устройството не поддържа биометрия
- `/settings` route добавен в `app_router.dart` с shared `_biometricService` инстанция
- `MainActivity.kt` обновена: `FlutterActivity` → `FlutterFragmentActivity` (задължително за `local_auth` Android)
- 14 unit тестове за `BiometricAuthService` — всички минават

#### Code Review Fixes (claude-sonnet-4-6)
- **AC1**: добавен auto-trigger на `BiometricLoginRequestedEvent` в `_checkBiometricAvailability` (initState)
- **AC7**: добавени 5 AuthBloc биометрични BLoC тестове в `auth_bloc_biometric_test.dart` (device unavailable, success, 1st failure, 3rd failure lock, no refresh token)
- `_BiometricButton` получава `isLoading` параметър → disabled по време на `AuthLoadingState`
- try/catch добавен в `_checkBiometricAvailability` (LoginScreen) и `_toggleBiometric` (SettingsScreen)
- `/settings` orphan route оправен — `CircleAvatar` в `_HomeTopBar` е tappable с навигация към `/settings`
- `incrementFailureCount()` оптимизиран — връща новия count директно; премахнато двойното storage четене
- `_kMaxFailures` → `kMaxFailures` (public); `_kFailureCount` → `kFailureCount` (public) — тестовете ползват константите
- `disable()` тест верифицира изтриване и на двата ключа (`kBiometricEnabled` + `kFailureCount`)
- `isLocked` тестове ползват `BiometricAuthService.kMaxFailures` вместо хардкодвано `'3'`

### File List

- `branivo_app/pubspec.yaml` — добавен `local_auth: ^2.3.0`
- `branivo_app/ios/Runner/Info.plist` — добавен `NSFaceIDUsageDescription`
- `branivo_app/android/app/src/main/AndroidManifest.xml` — добавени `USE_BIOMETRIC`, `USE_FINGERPRINT` permissions
- `branivo_app/android/app/src/main/kotlin/bg/branivo/branivo_app/MainActivity.kt` — `FlutterActivity` → `FlutterFragmentActivity`
- `branivo_app/lib/features/auth/services/biometric_auth_service.dart` — НОВО
- `branivo_app/lib/features/auth/bloc/auth_event.dart` — добавен `BiometricLoginRequestedEvent`
- `branivo_app/lib/features/auth/bloc/auth_bloc.dart` — добавен `biometricService` параметър + `_onBiometricLoginRequested` handler
- `branivo_app/lib/features/auth/screens/login_screen.dart` — добавен `biometricService` параметър + `_BiometricButton` widget + initState check
- `branivo_app/lib/features/settings/screens/settings_screen.dart` — НОВО
- `branivo_app/lib/core/routing/app_router.dart` — добавени imports + `_biometricService` instance + `biometricService` param в AuthBloc + `/settings` route
- `branivo_app/test/features/auth/biometric_auth_service_test.dart` — НОВО (14 тестa)
- `branivo_app/test/features/auth/auth_bloc_biometric_test.dart` — НОВО (5 AuthBloc биометрични теста)
- `branivo_app/lib/features/home/screens/home_screen.dart` — добавена навигация към /settings от CircleAvatar
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 15-1 → done
