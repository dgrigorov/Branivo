import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/fleet_bloc.dart';
import '../bloc/fleet_event.dart';
import '../bloc/fleet_state.dart';
import '../data/models/fleet_vehicle.dart';
import '../widgets/fleet_vehicle_card.dart';

class FleetDashboardScreen extends StatefulWidget {
  const FleetDashboardScreen({super.key});

  @override
  State<FleetDashboardScreen> createState() => _FleetDashboardScreenState();
}

class _FleetDashboardScreenState extends State<FleetDashboardScreen> {
  FleetVehicleStatus? _activeFilter;

  @override
  void initState() {
    super.initState();
    context.read<FleetBloc>().add(const FleetLoadRequested());
  }

  void _applyFilter(FleetVehicleStatus? status) {
    setState(() => _activeFilter = status);
    context.read<FleetBloc>().add(FleetStatusFilterChanged(statusFilter: status));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Fleet Dashboard')),
      body: Column(
        children: [
          _buildFilterBar(),
          Expanded(
            child: BlocBuilder<FleetBloc, FleetState>(
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

                if (state is FleetLoaded) {
                  if (state.vehicles.isEmpty) {
                    return const Center(
                      child: Text('Няма МПС'),
                    );
                  }

                  return ListView.builder(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: state.vehicles.length,
                    itemBuilder: (context, index) {
                      return FleetVehicleCard(vehicle: state.vehicles[index]);
                    },
                  );
                }

                return const SizedBox.shrink();
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterBar() {
    final filters = <({FleetVehicleStatus? status, String label})>[
      (status: null, label: 'Всички'),
      (status: FleetVehicleStatus.green, label: '✓ Зелени'),
      (status: FleetVehicleStatus.yellow, label: '⚠ Жълти'),
      (status: FleetVehicleStatus.red, label: '✕ Червени'),
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: filters.map((f) {
          final isActive = _activeFilter == f.status;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text(f.label),
              selected: isActive,
              onSelected: (_) => _applyFilter(f.status),
            ),
          );
        }).toList(),
      ),
    );
  }
}
