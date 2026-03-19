import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/anonymous_session/bloc/anonymous_session_bloc.dart';
import 'package:branivo_app/features/anonymous_session/data/repositories/anonymous_session_repository.dart';

class MockAnonymousSessionRepository extends Mock
    implements AnonymousSessionRepository {}

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late MockAnonymousSessionRepository mockRepository;
  late MockFlutterSecureStorage mockStorage;

  setUp(() {
    mockRepository = MockAnonymousSessionRepository();
    mockStorage = MockFlutterSecureStorage();
  });

  AnonymousSessionBloc buildBloc() => AnonymousSessionBloc(
        repository: mockRepository,
        storage: mockStorage,
      );

  group('AnonymousSessionBloc', () {
    test(
      'initialize without secure storage → creates new session → AnonymousSessionActiveState',
      () async {
        when(() => mockStorage.read(key: 'anon_session_id'))
            .thenAnswer((_) async => null);
        when(() => mockRepository.createSession())
            .thenAnswer((_) async => 'new-session-uuid');
        when(
          () => mockStorage.write(
            key: 'anon_session_id',
            value: 'new-session-uuid',
          ),
        ).thenAnswer((_) async {});

        final bloc = buildBloc();
        bloc.add(AnonymousSessionInitializeEvent());

        await expectLater(
          bloc.stream,
          emitsInOrder([
            isA<AnonymousSessionLoadingState>(),
            isA<AnonymousSessionActiveState>()
                .having((s) => s.sessionId, 'sessionId', 'new-session-uuid'),
          ]),
        );
      },
    );

    test(
      'initialize with valid stored ID → GET → AnonymousSessionActiveState',
      () async {
        when(() => mockStorage.read(key: 'anon_session_id'))
            .thenAnswer((_) async => 'existing-session-uuid');
        when(() => mockRepository.getSession('existing-session-uuid'))
            .thenAnswer(
          (_) async => AnonSessionData(
            sessionId: 'existing-session-uuid',
            tenantId: 'tenant-uuid',
            createdAt: '2026-03-19T10:00:00Z',
          ),
        );

        final bloc = buildBloc();
        bloc.add(AnonymousSessionInitializeEvent());

        await expectLater(
          bloc.stream,
          emitsInOrder([
            isA<AnonymousSessionLoadingState>(),
            isA<AnonymousSessionActiveState>()
                .having(
                  (s) => s.sessionId,
                  'sessionId',
                  'existing-session-uuid',
                ),
          ]),
        );
      },
    );

    test(
      '404 response (expired) → auto-renew → emits Expired then Active',
      () async {
        when(() => mockStorage.read(key: 'anon_session_id'))
            .thenAnswer((_) async => 'expired-session-uuid');
        when(() => mockRepository.getSession('expired-session-uuid'))
            .thenAnswer((_) async => null); // 404 → null
        when(() => mockStorage.delete(key: 'anon_session_id'))
            .thenAnswer((_) async {});
        when(() => mockRepository.createSession())
            .thenAnswer((_) async => 'renewed-session-uuid');
        when(
          () => mockStorage.write(
            key: 'anon_session_id',
            value: 'renewed-session-uuid',
          ),
        ).thenAnswer((_) async {});

        final bloc = buildBloc();
        bloc.add(AnonymousSessionInitializeEvent());

        await expectLater(
          bloc.stream,
          emitsInOrder([
            isA<AnonymousSessionLoadingState>(),
            isA<AnonymousSessionExpiredState>(),
            isA<AnonymousSessionActiveState>()
                .having(
                  (s) => s.sessionId,
                  'sessionId',
                  'renewed-session-uuid',
                ),
          ]),
        );
      },
    );

    test(
      '503 response → AnonymousSessionRequiresLoginState',
      () async {
        when(() => mockStorage.read(key: 'anon_session_id'))
            .thenAnswer((_) async => null);
        when(() => mockRepository.createSession()).thenThrow(
          const SessionUnavailableException('Временно изискваме регистрация'),
        );

        final bloc = buildBloc();
        bloc.add(AnonymousSessionInitializeEvent());

        await expectLater(
          bloc.stream,
          emitsInOrder([
            isA<AnonymousSessionLoadingState>(),
            isA<AnonymousSessionRequiresLoginState>(),
          ]),
        );
      },
    );

    test(
      'migrate event → calls repository, deletes storage key, emits MigratedState',
      () async {
        when(() => mockStorage.read(key: 'anon_session_id'))
            .thenAnswer((_) async => 'active-session-uuid');
        when(() => mockRepository.getSession('active-session-uuid'))
            .thenAnswer(
          (_) async => AnonSessionData(
            sessionId: 'active-session-uuid',
            tenantId: 'tenant-uuid',
            createdAt: '2026-03-19T10:00:00Z',
          ),
        );
        when(() => mockRepository.migrateSession('active-session-uuid', 'user-uuid'))
            .thenAnswer((_) async {});
        when(() => mockStorage.delete(key: 'anon_session_id'))
            .thenAnswer((_) async {});

        final bloc = buildBloc();
        bloc.add(AnonymousSessionInitializeEvent());

        // Wait for Active state
        await expectLater(
          bloc.stream,
          emitsInOrder([
            isA<AnonymousSessionLoadingState>(),
            isA<AnonymousSessionActiveState>(),
          ]),
        );

        bloc.add(AnonymousSessionMigrateEvent(userId: 'user-uuid'));

        await expectLater(
          bloc.stream,
          emits(isA<AnonymousSessionMigratedState>()),
        );

        verify(() => mockRepository.migrateSession('active-session-uuid', 'user-uuid')).called(1);
        verify(() => mockStorage.delete(key: 'anon_session_id')).called(1);
      },
    );
  });
}
