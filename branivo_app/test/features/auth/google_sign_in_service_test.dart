import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:mocktail/mocktail.dart';

import 'package:branivo_app/features/auth/services/google_sign_in_service.dart';

class MockGoogleSignIn extends Mock implements GoogleSignIn {}

class MockGoogleSignInAccount extends Mock implements GoogleSignInAccount {}

class MockGoogleSignInAuthentication extends Mock
    implements GoogleSignInAuthentication {}

void main() {
  late MockGoogleSignIn mockGoogleSignIn;
  late GoogleSignInService service;

  setUp(() {
    mockGoogleSignIn = MockGoogleSignIn();
    service = GoogleSignInService(googleSignIn: mockGoogleSignIn);
  });

  group('GoogleSignInService', () {
    group('signIn', () {
      test('returns idToken on successful sign-in', () async {
        final mockAccount = MockGoogleSignInAccount();
        final mockAuth = MockGoogleSignInAuthentication();

        when(() => mockGoogleSignIn.signIn())
            .thenAnswer((_) async => mockAccount);
        when(() => mockAccount.authentication)
            .thenAnswer((_) async => mockAuth);
        when(() => mockAuth.idToken).thenReturn('mock-id-token-123');

        final result = await service.signIn();

        expect(result, equals('mock-id-token-123'));
        verify(() => mockGoogleSignIn.signIn()).called(1);
      });

      test('returns null when user cancels sign-in', () async {
        when(() => mockGoogleSignIn.signIn()).thenAnswer((_) async => null);

        final result = await service.signIn();

        expect(result, isNull);
        verify(() => mockGoogleSignIn.signIn()).called(1);
      });

      test('propagates exception on GoogleSignIn error', () async {
        when(() => mockGoogleSignIn.signIn())
            .thenThrow(Exception('Network error'));

        expect(() => service.signIn(), throwsException);
      });
    });

    group('signOut', () {
      test('delegates signOut to GoogleSignIn instance', () async {
        when(() => mockGoogleSignIn.signOut())
            .thenAnswer((_) async => null);

        await service.signOut();

        verify(() => mockGoogleSignIn.signOut()).called(1);
      });
    });
  });
}
