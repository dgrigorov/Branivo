import 'dart:developer';
import 'package:dio/dio.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/auth_tokens.dart';
import '../services/google_sign_in_service.dart';

part 'auth_event.dart';
part 'auth_state.dart';

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc({
    required Dio dio,
    required FlutterSecureStorage storage,
    GoogleSignInService? googleSignInService,
  })  : _dio = dio,
        _storage = storage,
        _googleSignInService = googleSignInService,
        super(AuthInitialState()) {
    on<LoginRequestedEvent>(_onLoginRequested);
    on<TwoFAVerifyRequestedEvent>(_onTwoFAVerifyRequested);
    on<LogoutRequestedEvent>(_onLogoutRequested);
    on<TokenRefreshRequestedEvent>(_onTokenRefreshRequested);
    on<GoogleSignInRequestedEvent>(_onGoogleSignInRequested);
  }

  final Dio _dio;
  final FlutterSecureStorage _storage;
  final GoogleSignInService? _googleSignInService;

  Future<void> _onLoginRequested(
    LoginRequestedEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoadingState());
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/login',
        data: {'email': event.email, 'password': event.password},
      );
      final body = response.data!;

      if (body['requires_2fa'] == true) {
        emit(AuthRequires2FAState(tempToken: body['temp_token'] as String));
        return;
      }

      final tokens = AuthTokens.fromJson(body);
      await _storeTokens(tokens);
      emit(AuthAuthenticatedState(accessToken: tokens.accessToken));
    } on DioException catch (e) {
      emit(AuthErrorState(message: _extractError(e)));
    } catch (e) {
      log('AuthBloc login error', error: e);
      emit(AuthErrorState(message: 'An unexpected error occurred'));
    }
  }

  Future<void> _onTwoFAVerifyRequested(
    TwoFAVerifyRequestedEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoadingState());
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/2fa/verify',
        data: {'temp_token': event.tempToken, 'otp_code': event.otpCode},
      );
      final tokens = AuthTokens.fromJson(response.data!);
      await _storeTokens(tokens);
      emit(AuthAuthenticatedState(accessToken: tokens.accessToken));
    } on DioException catch (e) {
      emit(AuthErrorState(message: _extractError(e)));
    } catch (e) {
      log('AuthBloc 2FA verify error', error: e);
      emit(AuthErrorState(message: 'An unexpected error occurred'));
    }
  }

  Future<void> _onLogoutRequested(
    LogoutRequestedEvent event,
    Emitter<AuthState> emit,
  ) async {
    try {
      await _dio.post<void>('/api/v1/auth/logout');
    } catch (e) {
      log('AuthBloc logout error (non-critical)', error: e);
    } finally {
      await _clearTokens();
      emit(AuthInitialState());
    }
  }

  Future<void> _onTokenRefreshRequested(
    TokenRefreshRequestedEvent event,
    Emitter<AuthState> emit,
  ) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/refresh',
        data: {'refresh_token': event.refreshToken},
      );
      final tokens = AuthTokens.fromJson(response.data!);
      await _storeTokens(tokens);
      emit(AuthAuthenticatedState(accessToken: tokens.accessToken));
    } on DioException catch (e) {
      await _clearTokens();
      emit(AuthErrorState(message: _extractError(e)));
    }
  }

  Future<void> _onGoogleSignInRequested(
    GoogleSignInRequestedEvent event,
    Emitter<AuthState> emit,
  ) async {
    final service = _googleSignInService;
    if (service == null) {
      emit(AuthErrorState(message: 'Google Sign-In не е конфигуриран.'));
      return;
    }

    emit(AuthLoadingState());

    String? idToken;
    try {
      idToken = await service.signIn();
    } catch (e) {
      log('GoogleSignIn error', error: e);
      emit(AuthErrorState(message: 'Грешка при Google вход. Опитайте пак.'));
      return;
    }

    if (idToken == null) {
      // User cancelled — return to initial state without emitting error
      emit(AuthInitialState());
      return;
    }

    try {
      final body = <String, dynamic>{'id_token': idToken};
      if (event.sessionId != null) body['session_id'] = event.sessionId;

      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/client/google',
        data: body,
      );
      final data = response.data!;
      final accessToken = data['access_token'] as String;
      final user = data['user'] as Map<String, dynamic>;
      final accountMerged = (user['account_merged'] as bool?) ?? false;
      final phoneVerified = (user['phone_verified'] as bool?) ?? false;

      await _storage.write(key: 'access_token', value: accessToken);
      await _storage.write(
        key: 'phone_verified',
        value: phoneVerified ? 'true' : 'false',
      );

      emit(AuthAuthenticatedState(
        accessToken: accessToken,
        accountMerged: accountMerged,
        phoneVerified: phoneVerified,
      ));
    } on DioException catch (e) {
      emit(AuthErrorState(message: _extractError(e)));
    } catch (e) {
      log('AuthBloc google auth error', error: e);
      emit(AuthErrorState(message: 'Грешка при Google вход. Опитайте пак.'));
    }
  }

  Future<void> _storeTokens(AuthTokens tokens) async {
    await _storage.write(key: 'access_token', value: tokens.accessToken);
    await _storage.write(key: 'refresh_token', value: tokens.refreshToken);
  }

  Future<void> _clearTokens() async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'refresh_token');
    await _storage.delete(key: 'phone_verified');
  }

  String _extractError(DioException e) {
    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      final msg = data['message'];
      if (msg is String) return msg;
    }
    return switch (e.response?.statusCode) {
      401 => 'Невалидни данни за вход.',
      429 => 'Акаунтът е заключен. Опитайте по-късно.',
      _ => 'Възникна грешка. Моля, опитайте отново.',
    };
  }
}
