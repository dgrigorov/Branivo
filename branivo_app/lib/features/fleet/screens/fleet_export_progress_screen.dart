import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';
import '../bloc/fleet_export_bloc.dart';
import '../data/models/fleet_export_model.dart';
import '../data/repositories/fleet_export_repository.dart';

class FleetExportProgressScreen extends StatelessWidget {
  final String exportId;
  final FleetExportRepository repository;

  // ignore: invalid_use_of_visible_for_testing_member
  final FleetExportBloc? _testBloc;

  const FleetExportProgressScreen({
    super.key,
    required this.exportId,
    required this.repository,
    FleetExportBloc? testBloc,
  }) : _testBloc = testBloc;

  @override
  Widget build(BuildContext context) {
    final scaffold = _buildScaffold(context);
    final testBloc = _testBloc;
    if (testBloc != null) {
      return BlocProvider.value(value: testBloc, child: scaffold);
    }
    return BlocProvider(
      create: (_) => FleetExportBloc(repository: repository)
        ..add(FleetExportStatusPolledEvent(exportId: exportId)),
      child: scaffold,
    );
  }

  Widget _buildScaffold(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Статус на Експорт')),
      body: BlocBuilder<FleetExportBloc, FleetExportState>(
        builder: (context, state) {
          if (state is FleetExportLoadingState || state is FleetExportInitialState) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state is FleetExportFailedState) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Грешка: ${state.error}',
                  style: const TextStyle(color: Colors.red),
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }

          if (state is FleetExportProcessingState) {
            return _buildProcessingView(context, state.export);
          }

          if (state is FleetExportReadyState) {
            return _buildReadyView(context, state);
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildProcessingView(BuildContext context, FleetExportModel export) {
    final total = export.totalCount;
    final processed = export.completedCount + export.failedCount;
    final progress = total > 0 ? processed / total : 0.0;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.cloud_download_outlined, size: 64, color: Colors.blue),
          const SizedBox(height: 24),
          Text(
            'Генериране на документи...',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 16),
          LinearProgressIndicator(value: progress),
          const SizedBox(height: 8),
          Text(
            '$processed / $total документа обработени',
            style: const TextStyle(color: Colors.grey),
          ),
        ],
      ),
    );
  }

  Widget _buildReadyView(BuildContext context, FleetExportReadyState state) {
    final export = state.export;
    final total = export.totalCount;
    final processed = export.completedCount + export.failedCount;
    final progress = total > 0 ? processed / total : 1.0;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Icon(
            export.status == FleetExportStatus.completed
                ? Icons.check_circle
                : Icons.warning_amber_rounded,
            size: 64,
            color: export.status == FleetExportStatus.completed
                ? Colors.green
                : Colors.orange,
          ),
          const SizedBox(height: 16),
          Text(
            export.status == FleetExportStatus.completed
                ? 'Всички документи са готови!'
                : 'Частично завършен',
            style: Theme.of(context).textTheme.titleLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          LinearProgressIndicator(value: progress),
          const SizedBox(height: 8),
          Text(
            '${export.completedCount} успешни, ${export.failedCount} неуспешни от $total',
            style: const TextStyle(color: Colors.grey),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            icon: const Icon(Icons.download),
            label: const Text('Изтегли ZIP'),
            onPressed: () => _handleDownload(context, state),
          ),
          if (export.failedCount > 0) ...[
            const SizedBox(height: 16),
            _buildFailedList(context, export),
          ],
        ],
      ),
    );
  }

  Future<void> _handleDownload(
    BuildContext context,
    FleetExportReadyState state,
  ) async {
    if (state.downloadUrl != null) {
      final uri = Uri.parse(state.downloadUrl!);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      }
    } else {
      context
          .read<FleetExportBloc>()
          .add(FleetExportDownloadRequestedEvent(exportId: state.export.exportId));
    }
  }

  Widget _buildFailedList(BuildContext context, FleetExportModel export) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Неуспешни документи (${export.failedCount})',
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            color: Colors.red,
          ),
        ),
        const SizedBox(height: 8),
        ...export.failedPolicyIds.map(
          (item) => ListTile(
            dense: true,
            leading: const Icon(Icons.error_outline, color: Colors.red, size: 20),
            title: Text(
              item.policyId.substring(0, 8),
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            ),
            subtitle: Text(item.error, style: const TextStyle(fontSize: 11)),
          ),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () {
            final failedIds = export.failedPolicyIds.map((f) => f.policyId).toList();
            context.read<FleetExportBloc>().add(FleetExportStartedEvent(policyIds: failedIds));
          },
          child: const Text('Повтори неуспешните'),
        ),
      ],
    );
  }
}
