part of 'auth_bloc.dart';

sealed class AuthEvent {}

final class LoginRequestedEvent extends AuthEvent {
  LoginRequestedEvent({required this.email, required this.password});

  final String email;
  final String password;
}

final class TwoFAVerifyRequestedEvent extends AuthEvent {
  TwoFAVerifyRequestedEvent({required this.tempToken, required this.otpCode});

  final String tempToken;
  final String otpCode;
}

final class LogoutRequestedEvent extends AuthEvent {}

final class TokenRefreshRequestedEvent extends AuthEvent {
  TokenRefreshRequestedEvent({required this.refreshToken});

  final String refreshToken;
}
