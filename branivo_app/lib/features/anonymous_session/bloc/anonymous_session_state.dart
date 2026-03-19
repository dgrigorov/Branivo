part of 'anonymous_session_bloc.dart';

sealed class AnonymousSessionState {}

final class AnonymousSessionLoadingState extends AnonymousSessionState {}

final class AnonymousSessionActiveState extends AnonymousSessionState {
  AnonymousSessionActiveState({required this.sessionId});

  final String sessionId;
}

final class AnonymousSessionExpiredState extends AnonymousSessionState {}

final class AnonymousSessionRequiresLoginState extends AnonymousSessionState {}

final class AnonymousSessionMigratedState extends AnonymousSessionState {}

final class AnonymousSessionErrorState extends AnonymousSessionState {
  AnonymousSessionErrorState({required this.message});

  final String message;
}
