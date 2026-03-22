import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:branivo_app/features/fleet/bloc/fleet_export_bloc.dart';
import 'package:branivo_app/features/fleet/data/models/fleet_export_model.dart';
import 'package:branivo_app/features/fleet/data/repositories/fleet_export_repository.dart';
import 'package:branivo_app/features/fleet/screens/fleet_export_progress_screen.dart';

// ─── Helpers ─────────────────────────────────────────────────────────────────

FleetExportModel makeExport({
  FleetExportStatus status = FleetExportStatus.processing,
  int totalCount = 3,
  int completedCount = 1,
  int failedCount = 0,
  List<FleetPdfFailedItem> failedPolicyIds = const [],
}) {
  return FleetExportModel(
    exportId: 'test-export-id',
    status: status,
    totalCount: totalCount,
    completedCount: completedCount,
    failedCount: failedCount,
    failedPolicyIds: failedPolicyIds,
  );
}

FleetExportRepository _makeStubRepo() {
  return FleetExportRepository(dio: Dio());
}

/// A FleetExportBloc that emits a preset state immediately.
class _PreloadedFleetExportBloc extends FleetExportBloc {
  _PreloadedFleetExportBloc({required FleetExportState initialState})
      : super(repository: _makeStubRepo()) {
    emit(initialState);
  }
}

Widget buildTestWidget({required FleetExportState initialState}) {
  final bloc = _PreloadedFleetExportBloc(initialState: initialState);
  return MaterialApp(
    home: FleetExportProgressScreen(
      exportId: 'test-export-id',
      repository: _makeStubRepo(),
      testBloc: bloc,
    ),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

void main() {
  group('FleetExportProgressScreen', () {
    testWidgets('shows progress bar when status is processing', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: FleetExportProcessingState(
            export: makeExport(
              status: FleetExportStatus.processing,
              completedCount: 1,
              totalCount: 3,
            ),
          ),
        ),
      );

      await tester.pump();

      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      expect(find.text('1 / 3 документа обработени'), findsOneWidget);
    });

    testWidgets('shows download button when status is completed', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: FleetExportReadyState(
            export: makeExport(
              status: FleetExportStatus.completed,
              completedCount: 3,
              totalCount: 3,
            ),
          ),
        ),
      );

      await tester.pump();

      expect(find.text('Изтегли ZIP'), findsOneWidget);
    });

    testWidgets('shows failed list when failedCount > 0', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: FleetExportReadyState(
            export: makeExport(
              status: FleetExportStatus.partial,
              completedCount: 2,
              failedCount: 1,
              totalCount: 3,
              failedPolicyIds: const [
                FleetPdfFailedItem(
                  policyId: 'dddddddd-0000-0000-0000-000000000004',
                  error: 'PDF timeout',
                ),
              ],
            ),
          ),
        ),
      );

      await tester.pump();

      expect(find.text('Неуспешни документи (1)'), findsOneWidget);
      expect(find.text('Повтори неуспешните'), findsOneWidget);
      expect(find.text('PDF timeout'), findsOneWidget);
    });
  });
}
