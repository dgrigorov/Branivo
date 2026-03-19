import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/registration/bloc/registration_bloc.dart';
import 'package:branivo_app/features/registration/data/repositories/client_auth_repository.dart';

class MockClientAuthRepository extends Mock implements ClientAuthRepository {}

void main() {
  late MockClientAuthRepository mockRepository;

  setUp(() {
    mockRepository = MockClientAuthRepository();
  });

  RegistrationBloc buildBloc() =>
      RegistrationBloc(repository: mockRepository);

  const phone = '+35988123456';
  const otp = '123456';
  const sessionId = 'session-uuid';
  final mockUser = ClientUser(id: 'uid', phoneNumber: phone, isNew: true);

  group('RegistrationBloc', () {
    test('RequestOtpEvent → OtpSentState', () async {
      when(() => mockRepository.requestOtp(phone)).thenAnswer((_) async => 300);

      final bloc = buildBloc();
      bloc.add(RequestOtpEvent(phoneNumber: phone));

      await expectLater(
        bloc.stream,
        emits(
          isA<OtpSentState>().having((s) => s.expiresIn, 'expiresIn', 300),
        ),
      );
    });

    test('VerifyOtpEvent with correct OTP → OtpVerifyingState then RegistrationSuccessState', () async {
      when(() => mockRepository.verifyOtp(phone, otp, sessionId: sessionId))
          .thenAnswer((_) async => mockUser);

      final bloc = buildBloc();
      bloc.add(VerifyOtpEvent(phoneNumber: phone, otpCode: otp, sessionId: sessionId));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<OtpVerifyingState>(),
          isA<RegistrationSuccessState>()
              .having((s) => s.user.id, 'user.id', 'uid'),
        ]),
      );
    });

    test('RequestOtpEvent with 429 response → RateLimitedState', () async {
      when(() => mockRepository.requestOtp(phone))
          .thenThrow(const RateLimitException(retryAfter: 3600));

      final bloc = buildBloc();
      bloc.add(RequestOtpEvent(phoneNumber: phone));

      await expectLater(
        bloc.stream,
        emits(
          isA<RateLimitedState>()
              .having((s) => s.retryAfterSeconds, 'retryAfterSeconds', 3600),
        ),
      );
    });

    test('VerifyOtpEvent with 422 response → OtpVerifyingState then OtpExpiredState', () async {
      when(() => mockRepository.verifyOtp(phone, otp, sessionId: null))
          .thenThrow(const OtpExpiredException());

      final bloc = buildBloc();
      bloc.add(VerifyOtpEvent(phoneNumber: phone, otpCode: otp));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<OtpVerifyingState>(),
          isA<OtpExpiredState>(),
        ]),
      );
    });

    test('ResendOtpEvent → new OtpSentState', () async {
      when(() => mockRepository.requestOtp(phone)).thenAnswer((_) async => 300);

      final bloc = buildBloc();
      bloc.add(ResendOtpEvent(phoneNumber: phone));

      await expectLater(
        bloc.stream,
        emits(isA<OtpSentState>()),
      );
    });
  });
}
