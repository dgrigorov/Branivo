part of 'anonymous_session_bloc.dart';

sealed class AnonymousSessionEvent {}

final class AnonymousSessionInitializeEvent extends AnonymousSessionEvent {}

final class AnonymousSessionUpdateDataEvent extends AnonymousSessionEvent {
  AnonymousSessionUpdateDataEvent({this.vehicleData, this.selectedQuoteId});

  final Map<String, dynamic>? vehicleData;
  final String? selectedQuoteId;
}

final class AnonymousSessionMigrateEvent extends AnonymousSessionEvent {
  AnonymousSessionMigrateEvent({required this.userId});

  final String userId;
}
