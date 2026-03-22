import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/fleet_bloc.dart';
import '../bloc/fleet_event.dart';
import '../bloc/fleet_state.dart';
import '../data/models/driver_vehicle.dart';

class DriverDashboardScreen extends StatefulWidget {
  const DriverDashboardScreen({super.key});

  @override
  State<DriverDashboardScreen> createState() => _DriverDashboardScreenState();
}

class _DriverDashboardScreenState extends State<DriverDashboardScreen> {
  @override
  void initState() {
    super.initState();
    context.read<FleetBloc>().add(const DriverVehiclesRequested());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Моите МПС')),
      body: BlocBuilder<FleetBloc, FleetState>(
        builder: (context, state) {
          if (state is FleetLoading || state is FleetInitial) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state is FleetError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  state.message,
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            );
          }

          if (state is DriverVehicleLoaded) {
            if (state.vehicles.isEmpty) {
              return const Center(child: Text('Нямате назначени МПС'));
            }

            return ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: state.vehicles.length,
              itemBuilder: (context, index) {
                return _DriverVehicleCard(vehicle: state.vehicles[index]);
              },
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }
}

class _DriverVehicleCard extends StatelessWidget {
  final DriverVehicle vehicle;

  const _DriverVehicleCard({required this.vehicle});

  @override
  Widget build(BuildContext context) {
    final statusConfig = _statusConfig(vehicle.policyExpiresAt, vehicle.policyStatus);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: statusConfig.backgroundColor,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Center(
                child: Text(
                  statusConfig.icon,
                  style: TextStyle(
                    fontSize: 18,
                    color: statusConfig.iconColor,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        vehicle.licensePlate,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: statusConfig.backgroundColor,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: statusConfig.borderColor),
                        ),
                        child: Text(
                          statusConfig.label,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: statusConfig.iconColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${vehicle.make} ${vehicle.model}',
                    style: const TextStyle(fontSize: 14, color: Colors.black87),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    vehicle.insurerName ?? 'Без застраховател',
                    style: const TextStyle(fontSize: 13, color: Colors.grey),
                  ),
                  const SizedBox(height: 2),
                  if (vehicle.policyExpiresAt != null)
                    Text(
                      'Изтича: ${_formatDate(vehicle.policyExpiresAt!)}',
                      style: TextStyle(
                        fontSize: 12,
                        color: statusConfig.iconColor,
                      ),
                    )
                  else
                    const Text(
                      'Няма активна полица',
                      style: TextStyle(fontSize: 12, color: Colors.red),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')}.${date.year}';
  }

  _StatusConfig _statusConfig(DateTime? policyExpiresAt, String? policyStatus) {
    if (policyExpiresAt == null || policyStatus != 'active') {
      return _StatusConfig(
        icon: '✕',
        label: 'Изтекла',
        backgroundColor: const Color(0xFFFEE2E2),
        iconColor: const Color(0xFF991B1B),
        borderColor: const Color(0xFFFCA5A5),
      );
    }
    final daysLeft = policyExpiresAt.difference(DateTime.now()).inDays;
    if (daysLeft > 30) {
      return _StatusConfig(
        icon: '✓',
        label: 'Активна',
        backgroundColor: const Color(0xFFDCFCE7),
        iconColor: const Color(0xFF166534),
        borderColor: const Color(0xFFBBF7D0),
      );
    }
    if (daysLeft >= 1) {
      return _StatusConfig(
        icon: '⚠',
        label: 'Скоро изтича',
        backgroundColor: const Color(0xFFFEF9C3),
        iconColor: const Color(0xFF854D0E),
        borderColor: const Color(0xFFFDE047),
      );
    }
    return _StatusConfig(
      icon: '✕',
      label: 'Изтекла',
      backgroundColor: const Color(0xFFFEE2E2),
      iconColor: const Color(0xFF991B1B),
      borderColor: const Color(0xFFFCA5A5),
    );
  }
}

class _StatusConfig {
  final String icon;
  final String label;
  final Color backgroundColor;
  final Color iconColor;
  final Color borderColor;

  const _StatusConfig({
    required this.icon,
    required this.label,
    required this.backgroundColor,
    required this.iconColor,
    required this.borderColor,
  });
}
