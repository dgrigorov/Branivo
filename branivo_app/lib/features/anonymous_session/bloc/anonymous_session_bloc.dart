import 'dart:developer';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../data/repositories/anonymous_session_repository.dart';

part 'anonymous_session_event.dart';
part 'anonymous_session_state.dart';

const _storageKey = 'anon_session_id';

class AnonymousSessionBloc
    extends Bloc<AnonymousSessionEvent, AnonymousSessionState> {
  AnonymousSessionBloc({
    required AnonymousSessionRepository repository,
    required FlutterSecureStorage storage,
  })  : _repository = repository,
        _storage = storage,
        super(AnonymousSessionLoadingState()) {
    on<AnonymousSessionInitializeEvent>(_onInitialize);
    on<AnonymousSessionUpdateDataEvent>(_onUpdateData);
    on<AnonymousSessionMigrateEvent>(_onMigrate);
  }

  final AnonymousSessionRepository _repository;
  final FlutterSecureStorage _storage;

  Future<void> _onInitialize(
    AnonymousSessionInitializeEvent event,
    Emitter<AnonymousSessionState> emit,
  ) async {
    emit(AnonymousSessionLoadingState());
    try {
      final stored = await _storage.read(key: _storageKey);

      if (stored != null) {
        final session = await _repository.getSession(stored);

        if (session != null) {
          emit(AnonymousSessionActiveState(sessionId: session.sessionId));
          return;
        }

        // 404 — expired, delete stored key and create new
        await _storage.delete(key: _storageKey);
        emit(AnonymousSessionExpiredState());
      }

      // No stored session or expired — create new
      final newSessionId = await _repository.createSession();
      await _storage.write(key: _storageKey, value: newSessionId);
      emit(AnonymousSessionActiveState(sessionId: newSessionId));
    } on SessionUnavailableException {
      emit(AnonymousSessionRequiresLoginState());
    } catch (e) {
      log('AnonymousSessionBloc initialize error', error: e);
      emit(AnonymousSessionErrorState(message: e.toString()));
    }
  }

  Future<void> _onUpdateData(
    AnonymousSessionUpdateDataEvent event,
    Emitter<AnonymousSessionState> emit,
  ) async {
    final current = state;
    if (current is! AnonymousSessionActiveState) return;

    try {
      final payload = <String, dynamic>{};
      if (event.vehicleData != null) payload['vehicle_data'] = event.vehicleData;
      if (event.selectedQuoteId != null) payload['selected_quote_id'] = event.selectedQuoteId;

      await _repository.updateSession(current.sessionId, payload);
    } on SessionUnavailableException {
      emit(AnonymousSessionRequiresLoginState());
    } catch (e) {
      log('AnonymousSessionBloc update error', error: e);
    }
  }

  Future<void> _onMigrate(
    AnonymousSessionMigrateEvent event,
    Emitter<AnonymousSessionState> emit,
  ) async {
    final current = state;
    if (current is! AnonymousSessionActiveState) return;

    try {
      await _repository.migrateSession(current.sessionId, event.userId);
      await _storage.delete(key: _storageKey);
      emit(AnonymousSessionMigratedState());
    } on SessionUnavailableException {
      emit(AnonymousSessionRequiresLoginState());
    } catch (e) {
      log('AnonymousSessionBloc migrate error', error: e);
      emit(AnonymousSessionErrorState(message: e.toString()));
    }
  }
}
