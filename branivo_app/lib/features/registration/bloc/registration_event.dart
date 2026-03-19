part of 'registration_bloc.dart';

abstract class RegistrationEvent {}

class RequestOtpEvent extends RegistrationEvent {
  RequestOtpEvent({required this.phoneNumber});
  final String phoneNumber;
}

class VerifyOtpEvent extends RegistrationEvent {
  VerifyOtpEvent({
    required this.phoneNumber,
    required this.otpCode,
    this.sessionId,
  });
  final String phoneNumber;
  final String otpCode;
  final String? sessionId;
}

class ResendOtpEvent extends RegistrationEvent {
  ResendOtpEvent({required this.phoneNumber});
  final String phoneNumber;
}
