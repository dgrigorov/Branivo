part of 'auth_bloc.dart';

sealed class AuthState {}

final class AuthInitialState extends AuthState {}

final class AuthLoadingState extends AuthState {}

final class AuthRequires2FAState extends AuthState {
  AuthRequires2FAState({required this.tempToken});

  final String tempToken;
}

final class AuthAuthenticatedState extends AuthState {
  AuthAuthenticatedState({required this.accessToken});

  final String accessToken;
}

final class AuthErrorState extends AuthState {
  AuthErrorState({required this.message});

  final String message;
}
