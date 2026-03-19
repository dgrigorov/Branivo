import 'dart:developer';

import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/repositories/client_auth_repository.dart';

part 'registration_event.dart';
part 'registration_state.dart';

class RegistrationBloc extends Bloc<RegistrationEvent, RegistrationState> {
  RegistrationBloc({required ClientAuthRepository repository})
      : _repository = repository,
        super(RegistrationInitialState()) {
    on<RequestOtpEvent>(_onRequestOtp);
    on<VerifyOtpEvent>(_onVerifyOtp);
    on<ResendOtpEvent>(_onResendOtp);
  }

  final ClientAuthRepository _repository;

  Future<void> _onRequestOtp(
    RequestOtpEvent event,
    Emitter<RegistrationState> emit,
  ) async {
    try {
      final expiresIn = await _repository.requestOtp(event.phoneNumber);
      emit(OtpSentState(expiresIn: expiresIn));
    } on RateLimitException catch (e) {
      emit(RateLimitedState(retryAfterSeconds: e.retryAfter));
    } catch (e) {
      log('RegistrationBloc requestOtp error', error: e);
      emit(RegistrationErrorState(message: 'Неуспешно изпращане на код. Опитайте отново.'));
    }
  }

  Future<void> _onVerifyOtp(
    VerifyOtpEvent event,
    Emitter<RegistrationState> emit,
  ) async {
    emit(OtpVerifyingState());
    try {
      final user = await _repository.verifyOtp(
        event.phoneNumber,
        event.otpCode,
        sessionId: event.sessionId,
      );
      emit(RegistrationSuccessState(user: user));
    } on RateLimitException catch (e) {
      emit(RateLimitedState(retryAfterSeconds: e.retryAfter));
    } on OtpExpiredException {
      emit(OtpExpiredState());
    } catch (e) {
      log('RegistrationBloc verifyOtp error', error: e);
      emit(RegistrationErrorState(message: 'Грешен код. Опитайте отново.'));
    }
  }

  Future<void> _onResendOtp(
    ResendOtpEvent event,
    Emitter<RegistrationState> emit,
  ) async {
    try {
      final expiresIn = await _repository.requestOtp(event.phoneNumber);
      emit(OtpSentState(expiresIn: expiresIn));
    } on RateLimitException catch (e) {
      emit(RateLimitedState(retryAfterSeconds: e.retryAfter));
    } catch (e) {
      log('RegistrationBloc resendOtp error', error: e);
      emit(RegistrationErrorState(message: 'Неуспешно изпращане на код. Опитайте отново.'));
    }
  }
}
