part of 'auth_bloc.dart';

sealed class AuthState {}

final class AuthInitialState extends AuthState {}

final class AuthLoadingState extends AuthState {}

final class AuthRequires2FAState extends AuthState {
  AuthRequires2FAState({required this.tempToken});

  final String tempToken;
}

final class AuthAuthenticatedState extends AuthState {
  AuthAuthenticatedState({
    required this.accessToken,
    this.accountMerged = false,
    this.phoneVerified = true,
  });

  final String accessToken;

  /// True when a Google login merged with an existing SMS account.
  final bool accountMerged;

  /// False when authenticated via Google OAuth and phone is not yet verified.
  final bool phoneVerified;
}

final class AuthErrorState extends AuthState {
  AuthErrorState({required this.message});

  final String message;
}
