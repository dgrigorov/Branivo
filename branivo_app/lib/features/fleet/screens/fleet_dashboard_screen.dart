import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/fleet_bloc.dart';
import '../bloc/fleet_event.dart';
import '../bloc/fleet_state.dart';
import '../data/models/fleet_vehicle.dart';
import '../widgets/fleet_vehicle_card.dart';
import 'fleet_bulk_quote_screen.dart';

class FleetDashboardScreen extends StatefulWidget {
  const FleetDashboardScreen({super.key});

  @override
  State<FleetDashboardScreen> createState() => _FleetDashboardScreenState();
}

class _FleetDashboardScreenState extends State<FleetDashboardScreen> {
  FleetVehicleStatus? _activeFilter;
  final Set<String> _selectedIds = {};

  @override
  void initState() {
    super.initState();
    context.read<FleetBloc>().add(const FleetLoadRequested());
  }

  void _applyFilter(FleetVehicleStatus? status) {
    setState(() {
      _activeFilter = status;
      _selectedIds.clear();
    });
    context.read<FleetBloc>().add(FleetStatusFilterChanged(statusFilter: status));
  }

  void _toggleVehicle(String id) {
    setState(() {
      if (_selectedIds.contains(id)) {
        _selectedIds.remove(id);
      } else {
        _selectedIds.add(id);
      }
    });
  }

  void _toggleAll(List<FleetVehicle> vehicles) {
    setState(() {
      if (_selectedIds.length == vehicles.length) {
        _selectedIds.clear();
      } else {
        _selectedIds
          ..clear()
          ..addAll(vehicles.map((v) => v.id));
      }
    });
  }

  void _clearSelection() {
    setState(() => _selectedIds.clear());
  }

  void _navigateToBulkQuotes(List<String> vehicleIds) {
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => FleetBulkQuoteScreen(
          vehicleIds: vehicleIds,
          repository: context.read<FleetBloc>().fleetRepository,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Fleet Dashboard')),
      body: Column(
        children: [
          _buildFilterBar(),
          if (_selectedIds.isNotEmpty) _buildBulkActionBar(),
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
                    return const Center(child: Text('Няма МПС'));
                  }

                  final allSelected = _selectedIds.length == state.vehicles.length;

                  return Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 4,
                        ),
                        child: Row(
                          children: [
                            Checkbox(
                              value: allSelected
                                  ? true
                                  : _selectedIds.isEmpty
                                      ? false
                                      : null,
                              tristate: true,
                              onChanged: (_) => _toggleAll(state.vehicles),
                            ),
                            Text(
                              allSelected
                                  ? 'Премахни всички'
                                  : 'Избери всички',
                              style: const TextStyle(fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          itemCount: state.vehicles.length,
                          itemBuilder: (context, index) {
                            final vehicle = state.vehicles[index];
                            final isSelected = _selectedIds.contains(vehicle.id);
                            return FleetVehicleCard(
                              vehicle: vehicle,
                              isSelected: isSelected,
                              onTap: () => _toggleVehicle(vehicle.id),
                            );
                          },
                        ),
                      ),
                    ],
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

  Widget _buildBulkActionBar() {
    return Container(
      color: Colors.blue.shade50,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Text(
            '${_selectedIds.length} МПС избрани',
            style: TextStyle(
              color: Colors.blue.shade800,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(width: 12),
          ElevatedButton(
            onPressed: () => _navigateToBulkQuotes(_selectedIds.toList()),
            child: const Text('Получи оферти'),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: _clearSelection,
            child: const Text('Изчисти'),
          ),
        ],
      ),
    );
  }
}
