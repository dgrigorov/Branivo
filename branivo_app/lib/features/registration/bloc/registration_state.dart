part of 'registration_bloc.dart';

abstract class RegistrationState {}

class RegistrationInitialState extends RegistrationState {}

class OtpSentState extends RegistrationState {
  OtpSentState({required this.expiresIn, required this.phoneNumber});
  final int expiresIn;
  final String phoneNumber;
}

class OtpVerifyingState extends RegistrationState {}

class RegistrationSuccessState extends RegistrationState {
  RegistrationSuccessState({required this.user});
  final ClientUser user;
}

class OtpExpiredState extends RegistrationState {}

class RateLimitedState extends RegistrationState {
  RateLimitedState({required this.retryAfterSeconds});
  final int retryAfterSeconds;
}

class RegistrationErrorState extends RegistrationState {
  RegistrationErrorState({required this.message});
  final String message;
}

class ClientUser {
  const ClientUser({
    required this.id,
    required this.phoneNumber,
    required this.isNew,
  });

  final String id;
  final String phoneNumber;
  final bool isNew;

  factory ClientUser.fromJson(Map<String, dynamic> json) {
    return ClientUser(
      id: json['id'] as String,
      phoneNumber: json['phone_number'] as String,
      isNew: json['is_new'] as bool,
    );
  }
}
